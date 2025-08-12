import { app, BrowserWindow } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import axios from 'axios'
import https from 'node:https'
import express from 'express'

const isDev = process.env.VITE_DEV === '1'

// ---------- Tiny helper HTTP server (port 5123) ----------
const PORT = 5123
const appServer = express()
let serverStarted = false

// CORS (renderer from http://localhost:5173 -> http://127.0.0.1:5123)
appServer.use((req,res,next)=>{
  res.setHeader('Access-Control-Allow-Origin','*')
  res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers','Content-Type,Authorization')
  if (req.method === 'OPTIONS') return res.end()
  next()
})

// Cache DDragon id map
let ddVersion = null
let keyToId = {} // numeric key -> string id, e.g., 89 -> "Leona"

async function refreshDDragon() {
  try {
    const { data: vers } = await axios.get('https://ddragon.leagueoflegends.com/api/versions.json')
    const v = vers?.[0]
    if (!v) return
    if (v === ddVersion && Object.keys(keyToId).length) return
    const { data } = await axios.get(`https://ddragon.leagueoflegends.com/cdn/${v}/data/en_US/champion.json`)
    const map = {}
    Object.values(data.data).forEach(c => { map[Number(c.key)] = c.id })
    ddVersion = v
    keyToId = map
    console.log('[DD] loaded', v, Object.keys(map).length, 'champions')
  } catch (e) {
    console.warn('[DD] load failed', e.message)
  }
}

// Read LCU lockfile to get auth
function guessLockfilePaths() {
  const paths = []
  const env = process.env
  // Windows common
  paths.push('C:\\\\Riot Games\\\\League of Legends\\\\lockfile')
  if (env.LOCALAPPDATA) paths.push(path.join(env.LOCALAPPDATA, 'Riot Games', 'League of Legends', 'lockfile'))
  if (env.PROGRAMFILES) paths.push(path.join(env.PROGRAMFILES, 'Riot Games', 'League of Legends', 'lockfile'))
  if (env['PROGRAMFILES(X86)']) paths.push(path.join(env['PROGRAMFILES(X86)'], 'Riot Games', 'League of Legends', 'lockfile'))
  // macOS common
  paths.push('/Applications/League of Legends.app/Contents/LoL/lockfile')
  paths.push(path.join(os.homedir(), 'Applications', 'League of Legends.app', 'Contents', 'LoL', 'lockfile'))
  paths.push(path.join(os.homedir(), 'Library', 'Application Support', 'League of Legends', 'lockfile'))
  // Env override
  if (env.LOL_LOCKFILE) paths.unshift(env.LOL_LOCKFILE)
  return paths
}

function readLockfile() {
  const candidates = guessLockfilePaths()
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        const s = fs.readFileSync(p, 'utf8').trim()
        // Format: LeagueClientUx:<pid>:<port>:<password>:https
        const [name,pid,port,pass,proto] = s.split(':')
        return { name, pid: Number(pid), port: Number(port), pass, proto }
      }
    } catch {}
  }
  return null
}

async function getChampSelect() {
  const info = readLockfile()
  if (!info) return { ok:false, reason:'lockfile not found' }

  const httpsAgent = new https.Agent({ rejectUnauthorized:false })
  const client = axios.create({
    baseURL: `https://127.0.0.1:${info.port}`,
    httpsAgent,
    headers: {
      Authorization: 'Basic ' + Buffer.from('riot:'+info.pass).toString('base64')
    },
    timeout: 1200,
    validateStatus: () => true
  })

  try {
    const res = await client.get('/lol-champ-select/v1/session')
    if (res.status !== 200) return { ok:false, code:res.status }
    const s = res.data || {}

    // Side determine (100=BLUE, 200=RED) from myTeam if present
    let side = 'BLUE'
    try {
      const teamNum = (s.myTeam && s.myTeam[0] && s.myTeam[0].team) || 100
      side = teamNum === 200 ? 'RED' : 'BLUE'
    } catch {}

    // Picks (championId numeric -> id string)
    function mapPick(arr) {
      const out = [null,null,null,null,null]
      if (!Array.isArray(arr)) return out
      arr.forEach((p,i) => {
        const cid = Number(p?.championId || 0)
        out[i] = cid > 0 ? (keyToId[cid] || null) : null
      })
      return out
    }

    const ally = mapPick(s.myTeam)
    const enemy = mapPick(s.theirTeam)

    // Bans
    const bans = s.bans || {}
    const blueBans = (bans.myTeamBans || []).map(x => keyToId[Number(x)] || null).filter(Boolean)
    const redBans  = (bans.theirTeamBans || []).map(x => keyToId[Number(x)] || null).filter(Boolean)

    return { ok:true, ally, enemy, bans: { blue: blueBans, red: redBans }, side }
  } catch (e) {
    return { ok:false, error:e.message }
  }
}

appServer.get('/lobby/champ-select', async (req,res) => {
  await refreshDDragon()
  const data = await getChampSelect()
  if (!data.ok) return res.status(204).end()
  res.json({ ally: data.ally, enemy: data.enemy, bans: data.bans, side: data.side })
})

// Optionally: minimal builds endpoint stub
appServer.get('/builds', (req,res)=>{
  res.json({ runes: ['標準系（メタ）'], items: ['状況に応じて'] })
})

function ensureServer() {
  if (serverStarted) return
  appServer.listen(PORT, () => { serverStarted = true; console.log('[bridge] listening on', PORT) })
}

// ---------- Electron window ----------
let win
async function createWindow () {
  ensureServer()
  await refreshDDragon()

  win = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(process.cwd(), 'electron', 'preload.js'),
    }
  })

  if (isDev) {
    await win.loadURL('http://localhost:5173')
    win.webContents.openDevTools()
  } else {
    const indexPath = path.join(process.cwd(), 'dist', 'index.html')
    await win.loadFile(indexPath)
  }
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
