# Cloud Build (No local Node/npm needed)

You can build installers in GitHub Actions without installing anything locally.

## Steps
1. Create a GitHub repo (New → public or private).
2. Upload all files from this folder to the repo (Add file → Upload files).
3. Open the **Actions** tab → run **Build Installers** (workflow_dispatch).
   - Or create a tag named `v1.0.0` to trigger automatically.
4. When the workflow finishes, open the job → **Artifacts**:
   - `windows-installers` → contains `LoL-Pick-Advisor-Pro++-Setup-x.y.z.exe` and a portable `.exe`
   - `macos-dmg` → contains a `.dmg` (unsigned)

Distribute the EXE/DMG to users. End users **do not need Node.js/npm**.
