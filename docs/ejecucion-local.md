# Ejecutar SIOP después de clonar el repositorio

Guía para Windows con PowerShell. Instala **Python 3.12**, **Node.js 22 con npm 10** y Git. Abre una terminal en la carpeta del repositorio clonado y comprueba:

```powershell
python --version
node --version
npm --version
```

No necesitas base de datos ni instalar las carpetas de agentes. Las dependencias se descargan con los siguientes comandos; `node_modules/` y `.venv/` no se suben a GitHub.

## 1. Backend — primera terminal

Desde la raíz del repositorio:

```powershell
python -m venv apps/api/.venv
apps/api/.venv/Scripts/python.exe -m pip install -r requirements.txt
if (-not (Test-Path -LiteralPath .env) -and -not (Test-Path -LiteralPath apps/api/.env)) {
    Copy-Item -LiteralPath apps/api/.env.example -Destination apps/api/.env
}
```

La calculadora funciona sin clave de IA. Para probar texto, fotografías y voz, completa `GEMINI_API_KEY` y `GEMINI_TEXT_MODEL` en `apps/api/.env` con una clave y un modelo habilitados en tu proyecto de Gemini. Si utilizas un `.env` en la raíz, puedes configurarlos allí; evita tener valores diferentes en ambos archivos: `apps/api/.env` tiene prioridad, y las variables del sistema prevalecen sobre ambos.

Los archivos `.env` son privados y están ignorados por Git. Cada colega debe crear su configuración local. La clave va únicamente en el backend.

Arranca la API:

```powershell
apps/api/.venv/Scripts/python.exe -m uvicorn app.main:app --app-dir apps/api --host 127.0.0.1 --port 8000 --reload
```

Déjala abierta. API: <http://127.0.0.1:8000/api/v1/health>. Documentación: <http://127.0.0.1:8000/docs>. Después de cambiar la clave o el modelo en `.env`, detén con `Ctrl+C` y ejecuta de nuevo el comando de arranque.

## 2. Frontend — segunda terminal

Abre otra terminal en la raíz del mismo repositorio:

```powershell
cd apps/web
npm ci
if (-not (Test-Path -LiteralPath .env)) {
    Copy-Item -LiteralPath .env.example -Destination .env
}
npm run dev
```

El archivo `apps/web/.env` debe contener:

```dotenv
VITE_API_BASE_URL=/api/v1
```

Abre la dirección que muestra Vite, normalmente <http://localhost:5173/>. Mantén ambas terminales abiertas. Vite conecta `/api` con el backend del puerto 8000. En próximos arranques basta con ejecutar los comandos de los dos servidores; repite la instalación cuando cambien los archivos de dependencias.

## 3. Comprobar que funciona

1. Abre `/api/v1/health`: debe indicar `status: "ok"`. Este chequeo no llama a Gemini; `ai_available` solo indica que hay configuración, no que quede cuota.
2. Abre la web, carga el caso ILY y calcula: debe recomendar **1000 unidades** con costo anual **150840**. Wohl debe dar **1000 unidades** y **24725**. Estos cálculos no consumen IA.
3. Con credenciales y cuota disponibles, envía un ejercicio al asistente. Revisa su borrador antes de aplicarlo. Para voz, permite el micrófono en `localhost` o sube un archivo de audio.

Para ejecutar las pruebas unitarias y compilar, abre una tercera terminal desde la raíz:

```powershell
apps/api/.venv/Scripts/python.exe -m pytest -q
cd apps/web
npm test
npm run build
```

Estas pruebas no necesitan llamadas a Gemini. El build genera `apps/web/dist/`; para probar la aplicación integrada localmente usa `npm run dev` con la API encendida.

## Problemas frecuentes

| Síntoma | Solución |
| --- | --- |
| `python`, `node` o `npm` no se reconoce | Instala los requisitos, habilita su incorporación a PATH y abre otra terminal. Si Windows solo ofrece `py -3.12`, úsalo para crear el entorno virtual. |
| PowerShell bloquea `npm.ps1` | Usa `npm.cmd ci`, `npm.cmd run dev`, `npm.cmd test` y `npm.cmd run build`. No hace falta activar el entorno virtual de Python. |
| La web no conecta con el backend | Comprueba que la primera terminal sigue abierta en el puerto 8000 y que `VITE_API_BASE_URL=/api/v1`; reinicia Vite después de editar su `.env`. |
| El navegador no abre automáticamente | Copia la dirección que imprime Vite y ábrela manualmente; puede usar otro puerto si 5173 está ocupado. |
| El asistente no está disponible | Revisa clave, modelo, acceso y cuota. Reinicia la API tras editar `.env`. La calculadora manual sigue funcionando. |
| La IA tarda o se agotó su cuota | La aplicación reintenta los fallos temporales. Si la cuota diaria está agotada, conserva lo enviado durante la sesión y permite reintentar cuando haya cuota. |

Antes de subir los cambios, conserva `requirements.txt`, `apps/api/requirements.txt`, `apps/web/package.json`, `apps/web/package-lock.json` y ambos `.env.example`. Git debe excluir las claves reales, `.venv/`, `node_modules/` y `dist/` mediante el `.gitignore` incluido.
