//! Python 引擎 Worker 子进程管理（docs/06 §3）。
//! 无 shell 解释层，参数固定；不硬编码开发机路径 —— 引擎根由调用方按 dev/打包模式解析。

use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStderr, ChildStdin, ChildStdout, Command, Stdio};
use std::sync::Mutex;

pub struct EngineWorker {
    child: Mutex<Child>,
    stdin: Mutex<Option<ChildStdin>>,
}

impl EngineWorker {
    /// cwd 必须是包含 engine/ 包的目录（仓库根或打包资源根）。
    pub fn spawn(python_exe: &str, cwd: &Path, mock: bool) -> Result<EngineWorker, String> {
        Self::spawn_with_profile(python_exe, cwd, mock, None)
    }

    /// 指定浏览器 profile 目录（WEREAD_PROFILE），桌面模式指向应用数据目录（docs/10 §4）。
    pub fn spawn_with_profile(
        python_exe: &str,
        cwd: &Path,
        mock: bool,
        profile_dir: Option<&Path>,
    ) -> Result<EngineWorker, String> {
        let mut cmd = Command::new(python_exe);
        cmd.args(["-m", "engine.adapter.worker"])
            .current_dir(cwd)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        if mock {
            cmd.env("WEREAD_MOCK", "1");
        }
        if let Some(p) = profile_dir {
            cmd.env("WEREAD_PROFILE", p);
        }
        let mut child = cmd
            .spawn()
            .map_err(|e| format!("启动引擎进程失败 ({python_exe}): {e}"))?;
        let stdin = child.stdin.take().ok_or("无法获取引擎 stdin")?;
        Ok(EngineWorker {
            child: Mutex::new(child),
            stdin: Mutex::new(Some(stdin)),
        })
    }

    pub fn send_line(&self, line: &str) -> Result<(), String> {
        let mut guard = self.stdin.lock().map_err(|_| "引擎 stdin 锁损坏")?;
        let Some(stdin) = guard.as_mut() else {
            return Err("引擎 stdin 已关闭".into());
        };
        stdin
            .write_all(line.as_bytes())
            .and_then(|_| stdin.write_all(b"\n"))
            .and_then(|_| stdin.flush())
            .map_err(|e| format!("向引擎写入指令失败: {e}"))
    }

    pub fn take_stdout(&self) -> Result<ChildStdout, String> {
        self.child
            .lock()
            .map_err(|_| "引擎进程锁损坏")?
            .stdout
            .take()
            .ok_or_else(|| "引擎 stdout 已被取走".to_string())
    }

    pub fn take_stderr(&self) -> Result<ChildStderr, String> {
        self.child
            .lock()
            .map_err(|_| "引擎进程锁损坏")?
            .stderr
            .take()
            .ok_or_else(|| "引擎 stderr 已被取走".to_string())
    }

    /// 关闭 stdin（worker 收到 EOF 后按协议优雅退出）并回收进程。
    pub fn close_and_wait_for_child(&self) {
        let _ = self.stdin.lock().map(|mut g| g.take());
        if let Ok(mut child) = self.child.lock() {
            let _ = child.wait();
        }
    }
}

/// Python 解释器解析（docs/06：不硬编码开发机路径）。
/// 顺序：WEREAD_PYTHON 环境变量 → 仓库/资源根下的 .venv → 系统 python3/python。
pub fn resolve_python(engine_root: &Path) -> String {
    if let Ok(p) = std::env::var("WEREAD_PYTHON")
        && !p.is_empty()
    {
        return p;
    }
    let rel = if cfg!(windows) {
        ".venv/Scripts/python.exe"
    } else {
        ".venv/bin/python"
    };
    let venv = engine_root
        .parent()
        .map(|p| p.join(rel))
        .unwrap_or_else(|| PathBuf::from(rel));
    if venv.is_file() {
        return venv.to_string_lossy().into_owned();
    }
    if cfg!(windows) {
        "python".into()
    } else {
        "python3".into()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolve_python_prefers_env_then_venv() {
        // 无环境变量、无 venv → 系统 python3/python（edition 2024 中 set/remove_var 为 unsafe）
        unsafe { std::env::remove_var("WEREAD_PYTHON") };
        let empty = std::env::temp_dir().join("weread-nonexistent-engine-root");
        let py = resolve_python(&empty);
        assert!(py == "python3" || py == "python");

        // venv 存在 → 优先 venv（resolve_python 以 engine_root.parent() 为仓库根查找 .venv）
        let repo = std::env::temp_dir().join(format!("weread-pytest-{}", std::process::id()));
        let fake_engine_root = repo.join("engine");
        let venv_bin = if cfg!(windows) {
            repo.join(".venv/Scripts/python.exe")
        } else {
            repo.join(".venv/bin/python")
        };
        std::fs::create_dir_all(venv_bin.parent().unwrap()).unwrap();
        std::fs::write(&venv_bin, "").unwrap();
        let py = resolve_python(&fake_engine_root);
        assert!(py.ends_with(if cfg!(windows) { "python.exe" } else { "bin/python" }), "resolved: {py}");
        let _ = std::fs::remove_dir_all(&repo);
    }
}
