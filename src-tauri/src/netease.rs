// SPDX-License-Identifier: Apache-2.0
//
// API Enhanced 代理模块
// 通过 Rust 后端发起 HTTP 请求到API Enhanced，避免前端 CORS 限制

use reqwest::header::{HeaderMap, HeaderValue, COOKIE, REFERER, USER_AGENT, CONTENT_TYPE};
use serde_json::Value;
use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use std::io::Write;
use tauri_plugin_dialog::DialogExt;

static API_BASE_URL: OnceLock<Mutex<String>> = OnceLock::new();

fn get_api_base_url() -> &'static Mutex<String> {
    API_BASE_URL.get_or_init(|| {
        Mutex::new("https://netease-cloud-music-api-two-sandy.vercel.app".to_string())
    })
}

static HTTP_CLIENT: OnceLock<reqwest::Client> = OnceLock::new();

fn get_http_client() -> &'static reqwest::Client {
    HTTP_CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .use_rustls_tls()
            .connect_timeout(std::time::Duration::from_secs(15))
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .expect("Failed to create HTTP client")
    })
}

static DOWNLOAD_CLIENT: OnceLock<reqwest::Client> = OnceLock::new();

fn get_download_client() -> &'static reqwest::Client {
    DOWNLOAD_CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .use_rustls_tls()
            .connect_timeout(std::time::Duration::from_secs(15))
            .build()
            .expect("Failed to create download HTTP client")
    })
}

fn get_default_headers() -> HeaderMap {
    let mut headers = HeaderMap::new();
    headers.insert(
        USER_AGENT,
        HeaderValue::from_static("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"),
    );
    headers.insert(
        REFERER,
        HeaderValue::from_static("https://music.163.com"),
    );
    headers
}

/// 设置 API 基地址
#[tauri::command]
pub fn set_netease_api_base(url: String) {
    if let Ok(mut base) = get_api_base_url().lock() {
        *base = url;
    }
}

/// 获取当前 API 基地址
#[tauri::command]
pub fn get_netease_api_base() -> String {
    get_api_base_url().lock()
        .map(|b| b.clone())
        .unwrap_or_else(|_| "".to_string())
}

/// 从响应头中提取 Set-Cookie 并合并为一个字符串
fn extract_set_cookies(response: &reqwest::Response) -> Option<String> {
    let cookies: Vec<String> = response.headers()
        .get_all("set-cookie")
        .iter()
        .filter_map(|v| v.to_str().ok())
        .map(|s| s.to_string())
        .collect();
    if cookies.is_empty() {
        None
    } else {
        Some(cookies.join("; "))
    }
}

/// 如果 body 是 JSON 且没有 cookie 字段，则将 Set-Cookie 注入到 JSON 中
fn inject_cookie_to_body(body: String, set_cookie: Option<String>) -> String {
    if let Some(cookie_str) = set_cookie {
        if let Ok(mut json) = serde_json::from_str::<Value>(&body) {
            if let Some(obj) = json.as_object_mut() {
                // 只有当 body 中没有 cookie 字段，或 cookie 为空时才注入
                let needs_inject = match obj.get("cookie") {
                    None => true,
                    Some(Value::String(s)) => s.is_empty(),
                    Some(Value::Null) => true,
                    _ => false,
                };
                if needs_inject {
                    obj.insert("cookie".to_string(), Value::String(cookie_str));
                    if let Ok(new_body) = serde_json::to_string(&json) {
                        return new_body;
                    }
                }
            }
        }
    }
    body
}

/// 通用 API 请求（无 cookie）
#[tauri::command]
pub async fn netease_api_request(path: String, params: String) -> Result<String, String> {
    let base_url = get_api_base_url().lock()
        .map(|b| b.clone())
        .map_err(|e| format!("Failed to get API base URL: {}", e))?;

    let params_map: HashMap<String, Value> = serde_json::from_str(&params)
        .unwrap_or_default();

    let url = format!("{}{}", base_url, path);

    let mut headers = get_default_headers();
    headers.insert(
        CONTENT_TYPE,
        HeaderValue::from_static("application/x-www-form-urlencoded"),
    );

    // 构建查询字符串
    let mut query_params: Vec<(String, String)> = Vec::new();
    for (key, value) in &params_map {
        match value {
            Value::String(s) => query_params.push((key.clone(), s.clone())),
            Value::Number(n) => query_params.push((key.clone(), n.to_string())),
            _ => query_params.push((key.clone(), value.to_string())),
        }
    }

    let response = get_http_client()
        .get(&url)
        .headers(headers)
        .query(&query_params)
        .send()
        .await
        .map_err(|e| {
            let msg = if e.is_connect() {
                format!("连接失败 ({}): {} — 请检查网络连接或 API 地址是否正确", url, e)
            } else if e.is_timeout() {
                format!("请求超时 ({}): {}", url, e)
            } else {
                format!("API request failed ({}): {}", url, e)
            };
            msg
        })?;

    let set_cookies = extract_set_cookies(&response);
    let body = response.text().await
        .map_err(|e| format!("Failed to read response: {}", e))?;

    // 不再检查 HTTP 状态码，NeteaseCloudMusicApi 有时返回非 200 但 body 中有有效 JSON
    // 让前端根据 JSON 中的 code 字段自行判断
    Ok(inject_cookie_to_body(body, set_cookies))
}

/// 带 cookie 的 API 请求
#[tauri::command]
pub async fn netease_api_request_with_cookie(
    path: String,
    params: String,
    cookie: String,
) -> Result<String, String> {
    let base_url = get_api_base_url().lock()
        .map(|b| b.clone())
        .map_err(|e| format!("Failed to get API base URL: {}", e))?;

    let params_map: HashMap<String, Value> = serde_json::from_str(&params)
        .unwrap_or_default();

    let url = format!("{}{}", base_url, path);

    let mut headers = get_default_headers();
    headers.insert(
        CONTENT_TYPE,
        HeaderValue::from_static("application/x-www-form-urlencoded"),
    );

    if !cookie.is_empty() {
        headers.insert(
            COOKIE,
            HeaderValue::from_str(&cookie)
                .map_err(|e| format!("Invalid cookie: {}", e))?,
        );
    }

    // 构建查询字符串
    let mut query_params: Vec<(String, String)> = Vec::new();
    for (key, value) in &params_map {
        match value {
            Value::String(s) => query_params.push((key.clone(), s.clone())),
            Value::Number(n) => query_params.push((key.clone(), n.to_string())),
            _ => query_params.push((key.clone(), value.to_string())),
        }
    }

    // 如果有 cookie，也加到查询参数中（NeteaseCloudMusicApi 需要）
    if !cookie.is_empty() {
        query_params.push(("cookie".to_string(), cookie));
    }

    let response = get_http_client()
        .get(&url)
        .headers(headers)
        .query(&query_params)
        .send()
        .await
        .map_err(|e| {
            let msg = if e.is_connect() {
                format!("连接失败 ({}): {} — 请检查网络连接或 API 地址是否正确", url, e)
            } else if e.is_timeout() {
                format!("请求超时 ({}): {}", url, e)
            } else {
                format!("API request failed ({}): {}", url, e)
            };
            msg
        })?;

    let set_cookies = extract_set_cookies(&response);
    let body = response.text().await
        .map_err(|e| format!("Failed to read response: {}", e))?;

    Ok(inject_cookie_to_body(body, set_cookies))
}

/// 歌曲元数据，从前端传入
#[derive(serde::Deserialize)]
pub struct SongMetadata {
    pub title: String,
    pub artist: String,
    pub album: String,
    pub cover_url: Option<String>,
}

/// 从 URL 下载文件到指定路径，并写入元数据
#[tauri::command]
pub async fn download_netease_song(
    url: String,
    save_path: String,
    metadata: SongMetadata,
) -> Result<String, String> {
    println!("[download_netease_song] Downloading from: {}", url);
    println!("[download_netease_song] Save to: {}", save_path);

    let headers = get_default_headers();

    // 下载音频（使用无超时的下载客户端）
    let response = get_download_client()
        .get(&url)
        .headers(headers.clone())
        .send()
        .await
        .map_err(|e| {
            if e.is_connect() {
                format!("连接失败: {} — 请检查网络连接", e)
            } else if e.is_timeout() {
                format!("下载超时: {}", e)
            } else {
                format!("下载失败: {}", e)
            }
        })?;

    if !response.status().is_success() {
        return Err(format!("下载失败，HTTP 状态码: {}", response.status()));
    }

    let audio_bytes = response.bytes().await
        .map_err(|e| format!("读取下载内容失败: {}", e))?;

    // 下载封面图片（如果有）
    let cover_data: Option<Vec<u8>> = if let Some(ref cover_url) = metadata.cover_url {
        match get_download_client().get(cover_url).headers(headers).send().await {
            Ok(resp) if resp.status().is_success() => {
                resp.bytes().await.ok().map(|b| b.to_vec())
            }
            _ => None,
        }
    } else {
        None
    };

    // 确保目标目录存在
    if let Some(parent) = std::path::Path::new(&save_path).parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("创建目录失败: {}", e))?;
    }

    // 写入音频文件
    let mut file = std::fs::File::create(&save_path)
        .map_err(|e| format!("创建文件失败: {}", e))?;
    file.write_all(&audio_bytes)
        .map_err(|e| format!("写入文件失败: {}", e))?;
    drop(file);

    println!("[download_netease_song] Downloaded {} bytes, writing metadata...", audio_bytes.len());

    // 写入元数据
    let sp = save_path.clone();
    let md = metadata;
    let cd = cover_data;
    tokio::task::spawn_blocking(move || {
        write_audio_metadata(&sp, &md, cd.as_deref())
    })
    .await
    .map_err(|e| format!("元数据写入任务失败: {}", e))?
    .map_err(|e| println!("[download_netease_song] Warning: metadata write failed: {}", e))
    .ok();

    println!("[download_netease_song] Complete: {}", save_path);
    Ok(save_path)
}

/// 使用 lofty 写入音频文件元数据
fn write_audio_metadata(
    path: &str,
    metadata: &SongMetadata,
    cover_data: Option<&[u8]>,
) -> Result<(), String> {
    use lofty::prelude::*;
    use lofty::tag::{Accessor, Tag, TagType};
    use lofty::picture::{Picture, PictureType, MimeType};
    use lofty::config::WriteOptions;

    let file_path = std::path::Path::new(path);
    let ext = file_path.extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    // 根据扩展名确定标签类型
    let tag_type = match ext.as_str() {
        "mp3" => TagType::Id3v2,
        "flac" => TagType::VorbisComments,
        "ogg" => TagType::VorbisComments,
        "m4a" | "aac" => TagType::Mp4Ilst,
        _ => TagType::Id3v2,
    };

    let mut tagged_file = lofty::read_from_path(file_path)
        .map_err(|e| format!("无法读取音频文件: {}", e))?;

    // 获取或创建标签
    let tag = match tagged_file.tag_mut(tag_type) {
        Some(t) => t,
        None => {
            tagged_file.insert_tag(Tag::new(tag_type));
            tagged_file.tag_mut(tag_type)
                .ok_or_else(|| "创建标签失败".to_string())?
        }
    };

    // 写入文本元数据
    tag.set_title(metadata.title.clone());
    tag.set_artist(metadata.artist.clone());
    tag.set_album(metadata.album.clone());

    // 写入封面
    if let Some(data) = cover_data {
        // 猜测图片 MIME 类型
        let mime = if data.starts_with(&[0x89, 0x50, 0x4E, 0x47]) {
            MimeType::Png
        } else {
            MimeType::Jpeg
        };

        let picture = Picture::new_unchecked(
            PictureType::CoverFront,
            Some(mime),
            None,
            data.to_vec(),
        );
        tag.push_picture(picture);
    }

    // 保存
    tagged_file.save_to_path(file_path, WriteOptions::default())
        .map_err(|e| format!("保存元数据失败: {}", e))?;

    println!("[write_audio_metadata] Metadata written: {} - {} [{}]",
        metadata.artist, metadata.title, metadata.album);
    Ok(())
}

/// 打开保存文件对话框
#[tauri::command]
pub async fn save_file_dialog(app: tauri::AppHandle, default_name: String) -> Result<Option<String>, String> {
    let (tx, rx) = std::sync::mpsc::channel();

    app.dialog()
        .file()
        .set_file_name(&default_name)
        .add_filter("音频文件", &["mp3", "flac", "m4a", "ogg", "wav", "aac"])
        .save_file(move |path| {
            if let Some(p) = path {
                let _ = tx.send(Some(p.to_string()));
            } else {
                let _ = tx.send(None);
            }
        });

    rx.recv().map_err(|e| e.to_string())
}