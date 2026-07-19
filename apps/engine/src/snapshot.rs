use crate::state::Engine;
use std::fs;

const DIR: &str = "snapshots";
const PATH: &str = "snapshots/latest.json";

// borrowed view for writing - avoids cloning the engine on every save
#[derive(serde::Serialize)]
struct SnapRef<'a> {
    last_id: &'a str,
    engine: &'a Engine,
}

#[derive(serde::Deserialize)]
struct SnapOwned {
    last_id: String,
    engine: Engine,
}

pub fn save(engine: &Engine, last_id: &str) {
    let _ = fs::create_dir_all(DIR);
    let body = serde_json::to_string(&SnapRef { last_id, engine }).unwrap();
    let tmp = format!("{PATH}.tmp");
    // write tmp then rename -> atomic, nevveer a half written snapshot
    if fs::write(&tmp, body).is_ok() {
        let _ = fs::rename(&tmp, PATH);
    }
}

pub fn load() -> Option<(Engine, String)> {
    let body = fs::read_to_string(PATH).ok()?;
    let snap: SnapOwned = serde_json::from_str(&body).ok()?;
    Some((snap.engine, snap.last_id))
}
