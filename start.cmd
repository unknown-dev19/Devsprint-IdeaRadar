@echo off
rem Double-click or run from cmd/PowerShell. Bypasses the PowerShell script policy for this run only.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1"
