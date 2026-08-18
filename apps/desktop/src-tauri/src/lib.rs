use aes_gcm::{
    Aes256Gcm, Nonce,
    aead::{Aead, Generate, Key, KeyInit},
};
use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
use futures_util::StreamExt;
use keyring::Entry;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    fs,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    time::Duration,
};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_shell::{
    ShellExt,
    process::{CommandChild, CommandEvent},
};
use tokio::{
    fs::{File, OpenOptions},
    io::{AsyncReadExt, AsyncWriteExt},
};

const KEYCHAIN_SERVICE: &str = "com.cloudeai.desktop";
const KEYCHAIN_ACCOUNT: &str = "encrypted-history-key";
const LOCAL_SERVER_URL: &str = "http://127.0.0.1:11435";
// Modest Metal offload. ngl=99 on a large GGUF flashed the whole UI.
const DEFAULT_GPU_LAYERS: u32 = 8;
const GUI_RESERVED_CPU_CORES: usize = 2;
const DEFAULT_LOCAL_MODEL_ID: &str = "lfm2.5-2.6b";

struct LocalModelSpec {
    id: &'static str,
    label: &'static str,
    file: &'static str,
    url: &'static str,
    sha256: &'static str,
    bytes: u64,
    mmproj_file: Option<&'static str>,
    mmproj_url: Option<&'static str>,
    mmproj_sha256: Option<&'static str>,
    mmproj_bytes: Option<u64>,
}

const LOCAL_MODELS: &[LocalModelSpec] = &[
    LocalModelSpec {
        id: "lfm2.5-2.6b",
        label: "LFM2.5 2.6B",
        file: "LFM2.5-2.6B-Q4_K_M.gguf",
        url: "https://huggingface.co/LiquidAI/LFM2.5-2.6B-GGUF/resolve/main/LFM2.5-2.6B-Q4_K_M.gguf",
        sha256: "79fdf00351b46cf26f020aead28d01889886be87c55fa0eb907e6f9b00bfee14",
        bytes: 1_674_454_848,
        mmproj_file: None,
        mmproj_url: None,
        mmproj_sha256: None,
        mmproj_bytes: None,
    },
    LocalModelSpec {
        id: "lfm2.5-vl-3b",
        label: "LFM2.5 VL 3B",
        file: "LFM2.5-VL-3B-Q4_K_M.gguf",
        url: "https://huggingface.co/LiquidAI/LFM2.5-VL-3B-GGUF/resolve/main/LFM2.5-VL-3B-Q4_K_M.gguf",
        sha256: "83c18dfba02c75769cdd63f73e37c343400e82d434ff1b14bcc1cb02fcf2f5f2",
        bytes: 1_674_454_240,
        mmproj_file: Some("mmproj-LFM2.5-VL-3B-Q8_0.gguf"),
        mmproj_url: Some("https://huggingface.co/LiquidAI/LFM2.5-VL-3B-GGUF/resolve/main/mmproj-LFM2.5-VL-3B-Q8_0.gguf"),
        mmproj_sha256: Some("8ba27050dc88737db66b856d3b74e0e6cf54bee35fa4d9d9808f69ee556bbd43"),
        mmproj_bytes: Some(583_109_120),
    },
    LocalModelSpec {
        id: "lfm2-1.2b-extract",
        label: "LFM2 1.2B Extract",
        file: "LFM2-1.2B-Extract-Q4_K_M.gguf",
        url: "https://huggingface.co/LiquidAI/LFM2-1.2B-Extract-GGUF/resolve/main/LFM2-1.2B-Extract-Q4_K_M.gguf",
        sha256: "09b60b507ee7d1698b2b4dfce184c75083d7790c7701910ed60afa2801024702",
        bytes: 730_894_048,
        mmproj_file: None,
        mmproj_url: None,
        mmproj_sha256: None,
        mmproj_bytes: None,
    },
];

fn local_model_spec(id: Option<&str>) -> Result<&'static LocalModelSpec, String> {
    let requested = id.unwrap_or(DEFAULT_LOCAL_MODEL_ID);
    LOCAL_MODELS
        .iter()
        .find(|model| model.id == requested)
        .ok_or_else(|| format!("Unknown local model: {requested}"))
}

struct RuntimeState {
    child: Mutex<Option<CommandChild>>,
    running_model: Mutex<Option<String>>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ModelDownloadProgress {
    downloaded_bytes: u64,
    total_bytes: u64,
    percent: f64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ModelStatus {
    id: String,
    label: String,
    model_downloaded: bool,
    downloaded_bytes: u64,
    expected_bytes: u64,
    runtime_ready: bool,
    runtime_running: bool,
    model_path: String,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct EncryptedEnvelope {
    version: u8,
    algorithm: String,
    iv: String,
    ciphertext: String,
    updated_at: String,
}

#[derive(Deserialize, Serialize)]
struct LocalMessage {
    role: String,
    content: String,
    #[serde(default)]
    images: Option<Vec<LocalImage>>,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct LocalImage {
    mime_type: String,
    data_base64: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LocalChatResult {
    text: String,
    model: String,
}

fn app_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    Ok(directory)
}

fn models_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let directory = app_data_dir(app)?.join("models");
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    Ok(directory)
}

fn model_path(app: &AppHandle, spec: &LocalModelSpec) -> Result<PathBuf, String> {
    Ok(models_dir(app)?.join(spec.file))
}

fn mmproj_path(app: &AppHandle, spec: &LocalModelSpec) -> Result<Option<PathBuf>, String> {
    match spec.mmproj_file {
        Some(file) => Ok(Some(models_dir(app)?.join(file))),
        None => Ok(None),
    }
}

fn history_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_data_dir(app)?.join("history.enc.json"))
}

fn keychain_entry() -> Result<Entry, String> {
    Entry::new(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT).map_err(|error| error.to_string())
}

fn decode_key(value: &str) -> Result<[u8; 32], String> {
    let decoded = URL_SAFE_NO_PAD
        .decode(value)
        .map_err(|_| "The recovery key is not valid base64url.".to_string())?;
    decoded
        .try_into()
        .map_err(|_| "The recovery key must contain exactly 32 bytes.".to_string())
}

fn load_or_create_key() -> Result<[u8; 32], String> {
    let entry = keychain_entry()?;
    match entry.get_password() {
        Ok(value) => decode_key(&value),
        Err(keyring::Error::NoEntry) => {
            let key = Key::<Aes256Gcm>::generate();
            let encoded = URL_SAFE_NO_PAD.encode(key.as_slice());
            entry
                .set_password(&encoded)
                .map_err(|error| format!("Could not save the history key: {error}"))?;
            key.as_slice()
                .try_into()
                .map_err(|_| "Could not create the history key.".to_string())
        }
        Err(error) => Err(format!("Could not open macOS Keychain: {error}")),
    }
}

fn encrypt_payload(payload: &str, updated_at: String) -> Result<EncryptedEnvelope, String> {
    let key = load_or_create_key()?;
    let cipher = Aes256Gcm::new_from_slice(&key)
        .map_err(|_| "Could not initialize encryption.".to_string())?;
    let nonce = Nonce::generate();
    let ciphertext = cipher
        .encrypt(&nonce, payload.as_bytes())
        .map_err(|_| "Could not encrypt history.".to_string())?;

    Ok(EncryptedEnvelope {
        version: 1,
        algorithm: "AES-GCM".to_string(),
        iv: URL_SAFE_NO_PAD.encode(nonce),
        ciphertext: URL_SAFE_NO_PAD.encode(ciphertext),
        updated_at,
    })
}

fn decrypt_envelope(envelope: &EncryptedEnvelope) -> Result<String, String> {
    if envelope.version != 1 || envelope.algorithm != "AES-GCM" {
        return Err("This encrypted history format is not supported.".to_string());
    }

    let key = load_or_create_key()?;
    let nonce = URL_SAFE_NO_PAD
        .decode(&envelope.iv)
        .map_err(|_| "The encrypted history nonce is invalid.".to_string())?;
    let ciphertext = URL_SAFE_NO_PAD
        .decode(&envelope.ciphertext)
        .map_err(|_| "The encrypted history payload is invalid.".to_string())?;
    let nonce = Nonce::try_from(nonce.as_slice())
        .map_err(|_| "The encrypted history nonce has the wrong length.".to_string())?;
    let cipher = Aes256Gcm::new_from_slice(&key)
        .map_err(|_| "Could not initialize decryption.".to_string())?;
    let plaintext = cipher
        .decrypt(&nonce, ciphertext.as_ref())
        .map_err(|_| "The recovery key cannot decrypt this history.".to_string())?;
    String::from_utf8(plaintext).map_err(|_| "The decrypted history is not valid text.".to_string())
}

fn write_atomically(path: &Path, contents: &[u8]) -> Result<(), String> {
    let temporary_path = path.with_extension("tmp");
    fs::write(&temporary_path, contents).map_err(|error| error.to_string())?;
    fs::rename(&temporary_path, path).map_err(|error| error.to_string())
}

#[tauri::command]
fn load_app_data(app: AppHandle) -> Result<Option<String>, String> {
    let path = history_path(&app)?;
    if !path.exists() {
        return Ok(None);
    }
    let envelope: EncryptedEnvelope =
        serde_json::from_slice(&fs::read(path).map_err(|error| error.to_string())?)
            .map_err(|_| "The encrypted history file is damaged.".to_string())?;
    decrypt_envelope(&envelope).map(Some)
}

#[tauri::command]
fn save_app_data(app: AppHandle, payload: String, updated_at: String) -> Result<(), String> {
    let envelope = encrypt_payload(&payload, updated_at)?;
    let serialized = serde_json::to_vec(&envelope).map_err(|error| error.to_string())?;
    write_atomically(&history_path(&app)?, &serialized)
}

#[tauri::command]
fn read_encrypted_envelope(app: AppHandle) -> Result<Option<EncryptedEnvelope>, String> {
    let path = history_path(&app)?;
    if !path.exists() {
        return Ok(None);
    }
    serde_json::from_slice(&fs::read(path).map_err(|error| error.to_string())?)
        .map(Some)
        .map_err(|_| "The encrypted history file is damaged.".to_string())
}

#[tauri::command]
fn replace_encrypted_envelope(
    app: AppHandle,
    envelope: EncryptedEnvelope,
) -> Result<String, String> {
    let plaintext = decrypt_envelope(&envelope)?;
    let serialized = serde_json::to_vec(&envelope).map_err(|error| error.to_string())?;
    write_atomically(&history_path(&app)?, &serialized)?;
    Ok(plaintext)
}

#[tauri::command]
fn export_recovery_key() -> Result<String, String> {
    Ok(URL_SAFE_NO_PAD.encode(load_or_create_key()?))
}

#[tauri::command]
fn import_recovery_key(value: String) -> Result<(), String> {
    let key = decode_key(value.trim())?;
    keychain_entry()?
        .set_password(&URL_SAFE_NO_PAD.encode(key))
        .map_err(|error| format!("Could not save the recovery key: {error}"))
}

fn runtime_paths(app: &AppHandle) -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    if let Ok(configured) = std::env::var("CLOUDEAI_LLAMA_SERVER") {
        candidates.push(PathBuf::from(configured));
    }
    if let Ok(resource_dir) = app.path().resource_dir() {
        candidates.push(resource_dir.join("binaries/llama-server"));
        candidates.push(resource_dir.join("binaries/llama-server-aarch64-apple-darwin"));
        candidates.push(resource_dir.join("llama-server"));
    }
    candidates.push(
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("binaries/llama-server-aarch64-apple-darwin"),
    );
    candidates.push(PathBuf::from("/opt/homebrew/bin/llama-server"));
    candidates.push(PathBuf::from("/usr/local/bin/llama-server"));
    candidates
}

fn runtime_path(app: &AppHandle) -> Option<PathBuf> {
    runtime_paths(app).into_iter().find(|path| path.exists())
}

fn runtime_library_dir(app: &AppHandle) -> PathBuf {
    if let Ok(resource_dir) = app.path().resource_dir() {
        let bundled = resource_dir.join("binaries");
        if bundled.exists() {
            return bundled;
        }
    }
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("binaries")
}

fn parse_gpu_layers(value: Option<&str>) -> u32 {
    value
        .and_then(|raw| raw.parse::<u32>().ok())
        .unwrap_or(DEFAULT_GPU_LAYERS)
}

fn safe_cpu_threads() -> u32 {
    std::thread::available_parallelism()
        .map(|count| count.get())
        .unwrap_or(4)
        .saturating_sub(GUI_RESERVED_CPU_CORES)
        .max(1) as u32
}

fn local_server_args(model: &Path, mmproj: Option<&Path>) -> Vec<String> {
    local_server_args_for(
        model,
        parse_gpu_layers(std::env::var("CLOUDEAI_N_GPU_LAYERS").ok().as_deref()),
        mmproj,
    )
}

fn local_server_args_for(model: &Path, gpu_layers: u32, mmproj: Option<&Path>) -> Vec<String> {
    let mut args = vec![
        "-m".to_string(),
        model.to_string_lossy().into_owned(),
        "--host".to_string(),
        "127.0.0.1".to_string(),
        "--port".to_string(),
        "11435".to_string(),
        "--ctx-size".to_string(),
        "4096".to_string(),
        "--n-gpu-layers".to_string(),
        gpu_layers.to_string(),
        "--threads".to_string(),
        safe_cpu_threads().to_string(),
        "--prio".to_string(),
        "-1".to_string(),
        "--poll".to_string(),
        "0".to_string(),
        "--jinja".to_string(),
        "--no-webui".to_string(),
    ];
    if let Some(mmproj) = mmproj {
        args.extend([
            "--mmproj".to_string(),
            mmproj.to_string_lossy().into_owned(),
        ]);
    }
    if gpu_layers == 0 {
        args.extend([
            "--device".to_string(),
            "none".to_string(),
            "--no-op-offload".to_string(),
        ]);
    }
    args
}

fn kill_local_child(state: &State<'_, RuntimeState>) -> Result<(), String> {
    if let Some(child) = state
        .child
        .lock()
        .map_err(|_| "Local model state is unavailable.".to_string())?
        .take()
    {
        let _ = child.kill();
    }
    if let Ok(mut running) = state.running_model.lock() {
        *running = None;
    }
    Ok(())
}

#[tauri::command]
fn get_model_status(
    app: AppHandle,
    state: State<'_, RuntimeState>,
    model_id: Option<String>,
) -> Result<ModelStatus, String> {
    let spec = local_model_spec(model_id.as_deref())?;
    let path = model_path(&app, spec)?;
    let downloaded_bytes = path.metadata().map(|metadata| metadata.len()).unwrap_or(0);
    let mmproj_ready = match mmproj_path(&app, spec)? {
        Some(mmproj) => {
            mmproj.metadata().map(|metadata| metadata.len()).unwrap_or(0)
                == spec.mmproj_bytes.unwrap_or(0)
        }
        None => true,
    };
    let running_id = state
        .running_model
        .lock()
        .map_err(|_| "Local model state is unavailable.".to_string())?
        .clone();
    Ok(ModelStatus {
        id: spec.id.to_string(),
        label: spec.label.to_string(),
        model_downloaded: downloaded_bytes == spec.bytes && mmproj_ready,
        downloaded_bytes,
        expected_bytes: spec.bytes + spec.mmproj_bytes.unwrap_or(0),
        runtime_ready: runtime_path(&app).is_some(),
        runtime_running: running_id.as_deref() == Some(spec.id)
            && state
                .child
                .lock()
                .map_err(|_| "Local model state is unavailable.".to_string())?
                .is_some(),
        model_path: path.to_string_lossy().into_owned(),
    })
}

async fn file_sha256(path: &Path) -> Result<String, String> {
    let mut file = File::open(path).await.map_err(|error| error.to_string())?;
    let mut buffer = vec![0_u8; 1024 * 1024];
    let mut hasher = Sha256::new();
    loop {
        let read = file
            .read(&mut buffer)
            .await
            .map_err(|error| error.to_string())?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(hex::encode(hasher.finalize()))
}

#[tauri::command]
async fn download_local_model(app: AppHandle, model_id: Option<String>) -> Result<(), String> {
    let spec = local_model_spec(model_id.as_deref())?;
    download_verified_file(
        &app,
        spec.url,
        &model_path(&app, spec)?,
        spec.sha256,
        spec.bytes,
    )
    .await?;
    if let (Some(url), Some(sha), Some(bytes), Some(path)) = (
        spec.mmproj_url,
        spec.mmproj_sha256,
        spec.mmproj_bytes,
        mmproj_path(&app, spec)?,
    ) {
        download_verified_file(&app, url, &path, sha, bytes).await?;
    }
    Ok(())
}

async fn download_verified_file(
    app: &AppHandle,
    url: &str,
    destination: &Path,
    sha256: &str,
    expected_bytes: u64,
) -> Result<(), String> {
    if destination
        .metadata()
        .map(|metadata| metadata.len())
        .unwrap_or(0)
        == expected_bytes
    {
        return Ok(());
    }

    let temporary = destination.with_extension("gguf.part");
    let mut existing_bytes = tokio::fs::metadata(&temporary)
        .await
        .map(|metadata| metadata.len())
        .unwrap_or(0);
    if existing_bytes == expected_bytes {
        if file_sha256(&temporary).await? == sha256 {
            tokio::fs::rename(&temporary, destination)
                .await
                .map_err(|error| error.to_string())?;
            return Ok(());
        }
        tokio::fs::remove_file(&temporary)
            .await
            .map_err(|error| error.to_string())?;
        existing_bytes = 0;
    }
    if existing_bytes > expected_bytes {
        tokio::fs::remove_file(&temporary)
            .await
            .map_err(|error| error.to_string())?;
        existing_bytes = 0;
    }

    let client = reqwest::Client::new();
    let mut request = client.get(url).header("User-Agent", "CloudEAI/0.1");
    if existing_bytes > 0 {
        request = request.header(reqwest::header::RANGE, format!("bytes={existing_bytes}-"));
    }
    let response = request
        .send()
        .await
        .map_err(|error| format!("Could not start the model download: {error}"))?;
    if !response.status().is_success() {
        return Err(format!(
            "The model host returned HTTP {}.",
            response.status().as_u16()
        ));
    }

    let resumed = existing_bytes > 0 && response.status() == reqwest::StatusCode::PARTIAL_CONTENT;
    if existing_bytes > 0 && !resumed {
        existing_bytes = 0;
    }
    let total = if resumed {
        existing_bytes
            + response
                .content_length()
                .unwrap_or(expected_bytes - existing_bytes)
    } else {
        response.content_length().unwrap_or(expected_bytes)
    };
    let mut file = OpenOptions::new()
        .create(true)
        .write(true)
        .append(resumed)
        .truncate(!resumed)
        .open(&temporary)
        .await
        .map_err(|error| error.to_string())?;
    let mut stream = response.bytes_stream();
    let mut downloaded = existing_bytes;

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|error| format!("Model download interrupted: {error}"))?;
        file.write_all(&chunk)
            .await
            .map_err(|error| error.to_string())?;
        downloaded += chunk.len() as u64;
        let _ = app.emit(
            "model-download-progress",
            ModelDownloadProgress {
                downloaded_bytes: downloaded,
                total_bytes: total,
                percent: (downloaded as f64 / total as f64) * 100.0,
            },
        );
    }
    file.flush().await.map_err(|error| error.to_string())?;
    drop(file);

    let digest = file_sha256(&temporary).await?;
    if digest != sha256 || downloaded != expected_bytes {
        let _ = tokio::fs::remove_file(&temporary).await;
        return Err("The downloaded model failed its integrity check.".to_string());
    }
    tokio::fs::rename(&temporary, destination)
        .await
        .map_err(|error| error.to_string())
}

async fn local_server_is_healthy() -> bool {
    reqwest::Client::new()
        .get(format!("{LOCAL_SERVER_URL}/health"))
        .send()
        .await
        .map(|response| response.status().is_success())
        .unwrap_or(false)
}

async fn wait_for_local_server() -> Result<(), String> {
    // CPU-only load of the 4.8 GB GGUF can take over a minute on a Mac mini.
    for _ in 0..120 {
        if local_server_is_healthy().await {
            return Ok(());
        }
        tokio::time::sleep(Duration::from_secs(1)).await;
    }
    Err(
        "The local Liquid model took too long to start. Try again after closing other memory-heavy apps."
            .to_string(),
    )
}

#[tauri::command]
async fn start_local_model(
    app: AppHandle,
    state: State<'_, RuntimeState>,
    model_id: Option<String>,
) -> Result<(), String> {
    let spec = local_model_spec(model_id.as_deref())?;
    let running_id = state
        .running_model
        .lock()
        .map_err(|_| "Local model state is unavailable.".to_string())?
        .clone();
    let has_child = state
        .child
        .lock()
        .map_err(|_| "Local model state is unavailable.".to_string())?
        .is_some();
    if local_server_is_healthy().await && has_child && running_id.as_deref() == Some(spec.id) {
        return Ok(());
    }
    if local_server_is_healthy().await {
        let _ = reqwest::Client::new()
            .post(format!("{LOCAL_SERVER_URL}/exit"))
            .send()
            .await;
        tokio::time::sleep(Duration::from_millis(400)).await;
    }
    kill_local_child(&state)?;

    let path = model_path(&app, spec)?;
    if path.metadata().map(|metadata| metadata.len()).unwrap_or(0) != spec.bytes {
        return Err(format!(
            "Download {} in Settings before using local Liquid mode.",
            spec.label
        ));
    }
    let mmproj = mmproj_path(&app, spec)?;
    if let Some(mmproj) = &mmproj {
        if mmproj.metadata().map(|metadata| metadata.len()).unwrap_or(0)
            != spec.mmproj_bytes.unwrap_or(0)
        {
            return Err(format!(
                "Download the {} vision projector in Settings before using images.",
                spec.label
            ));
        }
    }
    if runtime_path(&app).is_none() {
        return Err("The bundled llama.cpp runtime is missing.".to_string());
    }

    let library_dir = runtime_library_dir(&app);
    let command = app
        .shell()
        .sidecar("llama-server")
        .map_err(|error| error.to_string())?
        .env("DYLD_LIBRARY_PATH", &library_dir)
        .env("DYLD_FALLBACK_LIBRARY_PATH", &library_dir)
        .args(local_server_args(&path, mmproj.as_deref()));
    let (mut events, child) = command.spawn().map_err(|error| error.to_string())?;
    *state
        .child
        .lock()
        .map_err(|_| "Local model state is unavailable.".to_string())? = Some(child);

    let stderr = Arc::new(Mutex::new(String::new()));
    let stderr_for_task = stderr.clone();
    tauri::async_runtime::spawn(async move {
        while let Some(event) = events.recv().await {
            match event {
                CommandEvent::Stderr(bytes) => {
                    let text = String::from_utf8_lossy(&bytes);
                    if let Ok(mut buffer) = stderr_for_task.lock()
                        && buffer.len() < 4_000
                    {
                        buffer.push_str(&text);
                    }
                }
                CommandEvent::Error(error) => eprintln!("llama-server: {error}"),
                _ => {}
            }
        }
    });

    if let Err(error) = wait_for_local_server().await {
        kill_local_child(&state)?;
        let detail = stderr
            .lock()
            .ok()
            .map(|buffer| buffer.trim().to_string())
            .filter(|text| !text.is_empty())
            .unwrap_or_default();
        if detail.to_lowercase().contains("library not loaded") || detail.contains("dyld") {
            return Err(format!(
                "{error} The llama.cpp sidecar could not load its libraries."
            ));
        }
        if !detail.is_empty() {
            return Err(format!("{error} {detail}"));
        }
        return Err(error);
    }
    *state
        .running_model
        .lock()
        .map_err(|_| "Local model state is unavailable.".to_string())? =
        Some(spec.id.to_string());
    Ok(())
}

#[tauri::command]
fn stop_local_model(state: State<'_, RuntimeState>) -> Result<(), String> {
    kill_local_child(&state)
}

#[tauri::command]
async fn local_chat(
    messages: Vec<LocalMessage>,
    system_prompt: String,
    temperature: f32,
    model_id: Option<String>,
) -> Result<LocalChatResult, String> {
    let spec = local_model_spec(model_id.as_deref())?;
    let client = reqwest::Client::new();
    let mut request_messages = vec![serde_json::json!({
        "role": "system",
        "content": system_prompt,
    })];
    request_messages.extend(messages.into_iter().map(|message| {
        if let Some(images) = message.images.filter(|images| !images.is_empty()) {
            let mut content = vec![serde_json::json!({
                "type": "text",
                "text": message.content,
            })];
            for image in images {
                content.push(serde_json::json!({
                    "type": "image_url",
                    "image_url": {
                        "url": format!("data:{};base64,{}", image.mime_type, image.data_base64),
                    }
                }));
            }
            serde_json::json!({
                "role": message.role,
                "content": content,
            })
        } else {
            serde_json::json!({
                "role": message.role,
                "content": message.content,
            })
        }
    }));

    let response = client
        .post(format!("{LOCAL_SERVER_URL}/v1/chat/completions"))
        .timeout(Duration::from_secs(180))
        .json(&serde_json::json!({
            "model": spec.id,
            "messages": request_messages,
            "temperature": temperature,
            "max_tokens": 1024,
            "stream": false,
        }))
        .send()
        .await
        .map_err(|error| {
            if error.is_timeout() {
                format!("{} timed out. Try a shorter question, or switch to Gemini.", spec.label)
            } else {
                format!("{} is not running. Start it in Settings and try again.", spec.label)
            }
        })?;

    if !response.status().is_success() {
        let status = response.status().as_u16();
        let detail = response
            .text()
            .await
            .unwrap_or_default()
            .chars()
            .take(280)
            .collect::<String>();
        return Err(if detail.trim().is_empty() {
            format!("{} returned HTTP {status}.", spec.label)
        } else {
            format!("{} returned HTTP {status}: {detail}", spec.label)
        });
    }
    let body: serde_json::Value = response
        .json()
        .await
        .map_err(|_| format!("{} returned an unreadable response.", spec.label))?;
    let text = body["choices"][0]["message"]["content"]
        .as_str()
        .unwrap_or("")
        .trim()
        .to_string();
    if text.is_empty() {
        return Err(format!("{} returned an empty response.", spec.label));
    }
    Ok(LocalChatResult {
        text,
        model: spec.label.to_string(),
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(RuntimeState {
            child: Mutex::new(None),
            running_model: Mutex::new(None),
        })
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|_| {
            tauri::async_runtime::spawn(async {
                if local_server_is_healthy().await {
                    let _ = reqwest::Client::new()
                        .post(format!("{LOCAL_SERVER_URL}/exit"))
                        .send()
                        .await;
                }
            });
            Ok(())
        })
        .on_window_event(|window, event| {
            if matches!(event, tauri::WindowEvent::Destroyed)
                && let Ok(mut guard) = window.state::<RuntimeState>().child.lock()
                && let Some(child) = guard.take()
            {
                let _ = child.kill();
            }
        })
        .invoke_handler(tauri::generate_handler![
            load_app_data,
            save_app_data,
            read_encrypted_envelope,
            replace_encrypted_envelope,
            export_recovery_key,
            import_recovery_key,
            get_model_status,
            download_local_model,
            start_local_model,
            stop_local_model,
            local_chat,
        ])
        .run(tauri::generate_context!())
        .expect("error while running CloudEAI");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recovery_key_requires_exactly_32_bytes() {
        let valid = URL_SAFE_NO_PAD.encode([7_u8; 32]);
        assert_eq!(decode_key(&valid).expect("valid key"), [7_u8; 32]);

        let too_short = URL_SAFE_NO_PAD.encode([7_u8; 31]);
        assert!(decode_key(&too_short).is_err());
        assert!(decode_key("not base64!").is_err());
    }

    #[test]
    fn atomic_write_replaces_existing_contents() {
        let path =
            std::env::temp_dir().join(format!("cloudeai-write-test-{}.json", uuid::Uuid::new_v4()));
        fs::write(&path, b"old").expect("seed file");
        write_atomically(&path, b"new").expect("atomic write");
        assert_eq!(fs::read(&path).expect("read file"), b"new");
        fs::remove_file(path).expect("remove file");
    }

    #[test]
    fn gpu_layers_default_to_a_modest_metal_offload() {
        assert_eq!(parse_gpu_layers(None), 8);
        assert_eq!(parse_gpu_layers(Some("")), 8);
        assert_eq!(parse_gpu_layers(Some("abc")), 8);
        assert_eq!(parse_gpu_layers(Some("0")), 0);
        assert_eq!(parse_gpu_layers(Some("12")), 12);
    }

    #[test]
    fn cpu_only_server_args_disable_metal_offload() {
        let args = local_server_args_for(Path::new("/tmp/model.gguf"), 0, None);
        let gpu_index = args.iter().position(|arg| arg == "--n-gpu-layers").unwrap();
        assert_eq!(args[gpu_index + 1], "0");
        assert!(args.windows(2).any(|pair| pair == ["--device", "none"]));
        assert!(args.iter().any(|arg| arg == "--no-op-offload"));
        assert!(args.windows(2).any(|pair| pair == ["--prio", "-1"]));
    }

    #[test]
    fn default_server_keeps_a_modest_context_window() {
        let args = local_server_args_for(Path::new("/tmp/model.gguf"), 8, None);
        let ctx = args.iter().position(|arg| arg == "--ctx-size").unwrap();
        assert_eq!(args[ctx + 1], "4096");
        let gpu_index = args.iter().position(|arg| arg == "--n-gpu-layers").unwrap();
        assert_eq!(args[gpu_index + 1], "8");
        assert!(!args.iter().any(|arg| arg == "--no-op-offload"));
    }

    #[test]
    fn vision_server_includes_the_mmproj_path() {
        let args = local_server_args_for(
            Path::new("/tmp/model.gguf"),
            8,
            Some(Path::new("/tmp/mmproj.gguf")),
        );
        assert!(args
            .windows(2)
            .any(|pair| pair == ["--mmproj", "/tmp/mmproj.gguf"]));
    }

    #[test]
    fn liquid_model_catalog_covers_the_pinned_ids() {
        assert_eq!(local_model_spec(None).unwrap().id, "lfm2.5-2.6b");
        assert_eq!(local_model_spec(Some("lfm2.5-vl-3b")).unwrap().label, "LFM2.5 VL 3B");
        assert!(local_model_spec(Some("lfm2-1.2b-extract")).unwrap().mmproj_file.is_none());
        assert!(local_model_spec(Some("missing")).is_err());
    }
}
