!macro customInstall
  SetShellVarContext current
  Delete "$DESKTOP\PoseChrono.lnk"
  CreateShortCut "$DESKTOP\PoseChrono.lnk" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" "" "$INSTDIR\resources\icon.ico" 0
!macroend

