; =============================================================================
; Sovereign Portal C-137 — Native Windows NSIS Installer (blueprint §13.3)
; Produces: PortalC137_Setup_x64.exe
; Build:   makensis windows\installer.nsi   (from the repo root)
; =============================================================================

!include "MUI2.nsh"
!include "FileFunc.nsh"

Name "Rick C-137 Sovereign Portal Interface"
OutFile "PortalC137_Setup_x64.exe"
InstallDir "$LOCALAPPDATA\SovereignPortal"
RequestExecutionLevel user

!define MUI_ABORTWARNING
!define MUI_ICON "assets\icon.ico"
!define MUI_UNICON "assets\icon.ico"

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "English"

VIProductVersion "1.0.0.0"
VIAddVersionKey "ProductName" "Sovereign Portal C-137"
VIAddVersionKey "CompanyName" "Sovereign Portal Project"
VIAddVersionKey "FileDescription" "Rick C-137 Sovereign Portal Interface Setup"
VIAddVersionKey "FileVersion" "1.0.0.0"
VIAddVersionKey "ProductVersion" "1.0.0"
VIAddVersionKey "LegalCopyright" "Sovereign Portal C-137"

Section "Install Sovereign Core" SecCore
  SetOutPath "$INSTDIR"

  ; Bundled web app (produced by tools/build-exe.ps1 -> dist\windows\)
  File /r "dist\windows\website\*.*"
  File "dist\windows\SovereignPortalC137.exe"
  File "assets\icon.ico"

  CreateDirectory "$SMPROGRAMS\Sovereign Portal C-137"
  CreateShortcut "$SMPROGRAMS\Sovereign Portal C-137\Portal C-137.lnk" "$INSTDIR\SovereignPortalC137.exe" "" "$INSTDIR\icon.ico"
  CreateShortcut "$DESKTOP\Portal C-137.lnk" "$INSTDIR\SovereignPortalC137.exe" "" "$INSTDIR\icon.ico"

  WriteUninstaller "$INSTDIR\Uninstall.exe"
SectionEnd

Section "Uninstall"
  Delete "$DESKTOP\Portal C-137.lnk"
  Delete "$SMPROGRAMS\Sovereign Portal C-137\*.*"
  RMDir "$SMPROGRAMS\Sovereign Portal C-137"
  RMDir /r "$INSTDIR"
SectionEnd
