# =====================================================================
# Programa el respaldo DIARIO de GruaLink en el Programador de tareas de
# Windows. Se ejecuta UNA vez en el servidor, en PowerShell como
# ADMINISTRADOR, desde la carpeta backend:
#
#   powershell -ExecutionPolicy Bypass -File .\scripts\programar-respaldo.ps1
#
# Opcional: cambiar la hora y cuántos respaldos conservar:
#   powershell -ExecutionPolicy Bypass -File .\scripts\programar-respaldo.ps1 -Hora 02:00 -Conservar 60
#
# La tarea queda con el nombre "GruaLink - Respaldo diario" y se ve en
# taskschd.msc. Para quitarla:
#   Unregister-ScheduledTask -TaskName "GruaLink - Respaldo diario"
# =====================================================================
param(
    [string]$Hora = "23:30",
    [int]$Conservar = 30
)

$ErrorActionPreference = "Stop"
$backend = Split-Path -Parent $PSScriptRoot
$node = (Get-Command node).Source

if (-not (Test-Path (Join-Path $backend ".env"))) {
    throw "No se encontró backend\.env. Configure la conexión antes de programar el respaldo."
}

$accion = New-ScheduledTaskAction -Execute $node `
    -Argument "scripts\respaldo.js --conservar $Conservar" `
    -WorkingDirectory $backend
$disparador = New-ScheduledTaskTrigger -Daily -At $Hora
# Corre aunque nadie haya iniciado sesión; si el equipo estaba apagado a esa hora, corre al encender
$opciones = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 1)
$usuario = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest

Register-ScheduledTask -TaskName "GruaLink - Respaldo diario" `
    -Action $accion -Trigger $disparador -Settings $opciones -Principal $usuario `
    -Description "Respaldo de la base de datos de GruaLink (pg_dump). Conserva los últimos $Conservar." `
    -Force | Out-Null

Write-Host "Listo: respaldo diario programado a las $Hora (se conservan los últimos $Conservar)."
Write-Host "Probarlo ahora:  Start-ScheduledTask -TaskName 'GruaLink - Respaldo diario'"
Write-Host "Ver resultados:  el archivo respaldos.log en la carpeta de respaldos."
