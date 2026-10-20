; VEX CLIENT installer — per-user install (no admin prompt), desktop + Start menu shortcuts.
; Build:  npm run dist:installer   (packs the app, then compiles this script with makensis)
Unicode true
!include "MUI2.nsh"

!ifndef VERSION
  !define VERSION "0.0.0"
!endif
!define APP "VEX CLIENT"
!define EXE "VEX CLIENT.exe"
!define UNINST_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\VEX CLIENT"

Name "${APP}"
OutFile "..\release\VEX-CLIENT-Setup-${VERSION}.exe"
InstallDir "$LOCALAPPDATA\Programs\VEX CLIENT"
InstallDirRegKey HKCU "${UNINST_KEY}" "InstallLocation"
RequestExecutionLevel user
SetCompressor /SOLID lzma
BrandingText "VEX CLIENT · Play different"

VIProductVersion "${VERSION}.0"
VIAddVersionKey "ProductName" "${APP}"
VIAddVersionKey "FileDescription" "${APP} Setup"
VIAddVersionKey "FileVersion" "${VERSION}"
VIAddVersionKey "ProductVersion" "${VERSION}"
VIAddVersionKey "CompanyName" "Albatron2580"
VIAddVersionKey "LegalCopyright" "VEX CLIENT"

!define MUI_ICON "..\build\icon.ico"
!define MUI_UNICON "..\build\icon.ico"
!define MUI_ABORTWARNING
!define MUI_WELCOMEPAGE_TITLE "Install VEX CLIENT"
!define MUI_WELCOMEPAGE_TEXT "This puts VEX CLIENT on your PC and adds a VEX CLIENT icon to your desktop and Start menu.$\r$\n$\r$\nNo administrator rights are needed."
!define MUI_FINISHPAGE_RUN "$INSTDIR\${EXE}"
!define MUI_FINISHPAGE_RUN_TEXT "Open VEX CLIENT now"

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"
!insertmacro MUI_LANGUAGE "Dutch"

Section "Install"
  ; Close a running copy so files can be replaced on update.
  nsExec::Exec 'taskkill /F /IM "${EXE}"'
  Sleep 500
  SetOutPath "$INSTDIR"
  File /r "..\release\win-unpacked\*.*"

  ; Desktop + Start menu shortcuts with the VEX icon embedded in the exe.
  CreateShortCut "$DESKTOP\${APP}.lnk" "$INSTDIR\${EXE}" "" "$INSTDIR\${EXE}" 0
  CreateShortCut "$SMPROGRAMS\${APP}.lnk" "$INSTDIR\${EXE}" "" "$INSTDIR\${EXE}" 0

  WriteUninstaller "$INSTDIR\Uninstall VEX CLIENT.exe"
  WriteRegStr HKCU "${UNINST_KEY}" "DisplayName" "${APP}"
  WriteRegStr HKCU "${UNINST_KEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "${UNINST_KEY}" "Publisher" "Albatron2580"
  WriteRegStr HKCU "${UNINST_KEY}" "DisplayIcon" "$INSTDIR\${EXE}"
  WriteRegStr HKCU "${UNINST_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNINST_KEY}" "UninstallString" '"$INSTDIR\Uninstall VEX CLIENT.exe"'
  WriteRegDWORD HKCU "${UNINST_KEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINST_KEY}" "NoRepair" 1

  ; Silent installs come from the in-app updater: start the new version straight away.
  IfSilent 0 +2
    Exec '"$INSTDIR\${EXE}"'
SectionEnd

Section "Uninstall"
  nsExec::Exec 'taskkill /F /IM "${EXE}"'
  Sleep 500
  Delete "$DESKTOP\${APP}.lnk"
  Delete "$SMPROGRAMS\${APP}.lnk"
  RMDir /r "$INSTDIR"
  DeleteRegKey HKCU "${UNINST_KEY}"
  ; Settings, instances and skins in %APPDATA%\VEX CLIENT are kept on purpose.
SectionEnd
