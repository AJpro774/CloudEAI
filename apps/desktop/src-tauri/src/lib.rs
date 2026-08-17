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
    sync::Mutex,
    time::Duration,
};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_shell::{ShellExt, process::CommandChild};
use tokio::{
    fs::{File, OpenOptions},
    io::{AsyncReadExt, AsyncWriteExt},
};

const KEYCHAIN_SERVICE: &str = "com.cloudeai.desktop";
const KEYCHAIN_ACCOUNT: &str = "encrypted-history-key";
const MODEL_FILE: &str = "gemma-4-E4B_q4_0-it.gguf";
const MODEL_URL: &str = "https://huggingface.co/google/gemma-4-E4B-it-qat-q4_0-gguf/resolve/main/gemma-4-E4B_q4_0-it.gguf";
const MODEL_SHA256: &str = "676c35070db6dbe52f93e9c864ee0fba4eddea94b9c875d9cb10daff453fbaee";
const MODEL_BYTES: u64 = 5_154_941_280;
const LOCAL_SERVER_URL: &str = "http://127.0.0.1:11435";

struct RuntimeState {
    child: Mutex<Option<CommandChild>>,
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

fn model_path(app: &AppHandle) -> Result<PathBuf, String> {
    let directory = app_data_dir(app)?.join("models");
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    Ok(directory.join(MODEL_FILE))
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

#[tauri::command]
fn get_model_status(app: AppHandle, state: State<'_, RuntimeState>) -> Result<ModelStatus, String> {
    let path = model_path(&app)?;
    let downloaded_bytes = path.metadata().map(|metadata| metadata.len()).unwrap_or(0);
    Ok(ModelStatus {
        model_downloaded: downloaded_bytes == MODEL_BYTES,
        downloaded_bytes,
        expected_bytes: MODEL_BYTES,
        runtime_ready: runtime_path(&app).is_some(),
        runtime_running: state
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
async fn download_local_model(app: AppHandle) -> Result<(), String> {
    let destination = model_path(&app)?;
    if destination
        .metadata()
        .map(|metadata| metadata.len())
        .unwrap_or(0)
        == MODEL_BYTES
    {
        return Ok(());
    }

    let temporary = destination.with_extension("gguf.part");
    let mut existing_bytes = tokio::fs::metadata(&temporary)
        .await
        .map(|metadata| metadata.len())
        .unwrap_or(0);
    if existing_bytes == MODEL_BYTES {
        if file_sha256(&temporary).await? == MODEL_SHA256 {
            tokio::fs::rename(&temporary, &destination)
                .await
                .map_err(|error| error.to_string())?;
            return Ok(());
        }
        tokio::fs::remove_file(&temporary)
            .await
            .map_err(|error| error.to_string())?;
        existing_bytes = 0;
    }
    if existing_bytes > MODEL_BYTES {
        tokio::fs::remove_file(&temporary)
            .await
            .map_err(|error| error.to_string())?;
        existing_bytes = 0;
    }

    let client = reqwest::Client::new();
    let mut request = client.get(MODEL_URL).header("User-Agent", "CloudEAI/0.1");
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
                .unwrap_or(MODEL_BYTES - existing_bytes)
    } else {
        response.content_length().unwrap_or(MODEL_BYTES)
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
    if digest != MODEL_SHA256 || downloaded != MODEL_BYTES {
        let _ = tokio::fs::remove_file(&temporary).await;
        return Err("The downloaded model failed its integrity check.".to_string());
    }
    tokio::fs::rename(&temporary, &destination)
        .await
        .map_err(|error| error.to_string())
}

async fn wait_for_local_server() -> Result<(), String> {
    let client = reqwest::Client::new();
    for _ in 0..60 {
        if client
            .get(format!("{LOCAL_SERVER_URL}/health"))
            .send()
            .await
            .map(|response| response.status().is_success())
            .unwrap_or(false)
        {
            return Ok(());
        }
        tokio::time::sleep(Duration::from_millis(500)).await;
    }
    Err(
        "Gemma took too long to start. Try again after closing other memory-heavy apps."
            .to_string(),
    )
}

#[tauri::command]
async fn start_local_model(app: AppHandle, state: State<'_, RuntimeState>) -> Result<(), String> {
    let already_started = state
        .child
        .lock()
        .map_err(|_| "Local model state is unavailable.".to_string())?
        .is_some();
    if already_started {
        if wait_for_local_server().await.is_ok() {
            return Ok(());
        }
        if let Some(stale_child) = state
            .child
            .lock()
            .map_err(|_| "Local model state is unavailable.".to_string())?
            .take()
        {
            let _ = stale_child.kill();
        }
    }

    let path = model_path(&app)?;
    if path.metadata().map(|metadata| metadata.len()).unwrap_or(0) != MODEL_BYTES {
        return Err("Download Gemma 4 before starting local mode.".to_string());
    }
    if runtime_path(&app).is_none() {
        return Err("The bundled llama.cpp runtime is missing.".to_string());
    }

    let command = app
        .shell()
        .sidecar("llama-server")
        .map_err(|error| error.to_string())?
        .env("DYLD_LIBRARY_PATH", runtime_library_dir(&app))
        .args([
            "-m",
            &path.to_string_lossy(),
            "--host",
            "127.0.0.1",
            "--port",
            "11435",
            "--ctx-size",
            "8192",
            "--n-gpu-layers",
            "99",
            "--jinja",
            "--no-webui",
        ]);
    let (mut events, child) = command.spawn().map_err(|error| error.to_string())?;
    *state
        .child
        .lock()
        .map_err(|_| "Local model state is unavailable.".to_string())? = Some(child);

    tauri::async_runtime::spawn(async move {
        while let Some(event) = events.recv().await {
            if let tauri_plugin_shell::process::CommandEvent::Error(error) = event {
                eprintln!("llama-server: {error}");
            }
        }
    });

    wait_for_local_server().await
}

#[tauri::command]
fn stop_local_model(state: State<'_, RuntimeState>) -> Result<(), String> {
    if let Some(child) = state
        .child
        .lock()
        .map_err(|_| "Local model state is unavailable.".to_string())?
        .take()
    {
        child.kill().map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn local_chat(
    messages: Vec<LocalMessage>,
    system_prompt: String,
    temperature: f32,
) -> Result<LocalChatResult, String> {
    let client = reqwest::Client::new();
    let mut request_messages = vec![serde_json::json!({
        "role": "system",
        "content": system_prompt,
    })];
    request_messages.extend(messages.into_iter().map(|message| {
        serde_json::json!({
            "role": message.role,
            "content": message.content,
        })
    }));

    let response = client
        .post(format!("{LOCAL_SERVER_URL}/v1/chat/completions"))
        .json(&serde_json::json!({
            "model": "gemma-4-e4b-it-q4",
            "messages": request_messages,
            "temperature": temperature,
            "max_tokens": 4096,
            "stream": false,
        }))
        .send()
        .await
        .map_err(|_| "Gemma is not running. Start local mode and try again.".to_string())?;

    if !response.status().is_success() {
        return Err(format!(
            "Gemma returned HTTP {}.",
            response.status().as_u16()
        ));
    }
    let body: serde_json::Value = response
        .json()
        .await
        .map_err(|_| "Gemma returned an unreadable response.".to_string())?;
    let text = body["choices"][0]["message"]["content"]
        .as_str()
        .unwrap_or("")
        .trim()
        .to_string();
    if text.is_empty() {
        return Err("Gemma returned an empty response.".to_string());
    }
    Ok(LocalChatResult {
        text,
        model: "Gemma 4 E4B Q4".to_string(),
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(RuntimeState {
            child: Mutex::new(None),
        })
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
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
}
