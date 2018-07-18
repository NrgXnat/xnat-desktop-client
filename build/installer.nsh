!addplugindir '.\Plugins'

!macro customInstall
  DetailPrint "Register XNAT URI Handler"
  DeleteRegKey HKCR "xnat"
  WriteRegStr HKCR "xnat" "" "URL:xnat"
  WriteRegStr HKCR "xnat" "URL Protocol" ""
  WriteRegStr HKCR "xnat\DefaultIcon" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
  WriteRegStr HKCR "xnat\shell" "" ""
  WriteRegStr HKCR "xnat\shell\Open" "" ""
  WriteRegStr HKCR "xnat\shell\Open\command" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME} %1"
  
  DeleteRegKey HKCR "xnats"
  WriteRegStr HKCR "xnats" "" "URL:xnats"
  WriteRegStr HKCR "xnats" "URL Protocol" ""
  WriteRegStr HKCR "xnats\DefaultIcon" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
  WriteRegStr HKCR "xnats\shell" "" ""
  WriteRegStr HKCR "xnats\shell\Open" "" ""
  WriteRegStr HKCR "xnats\shell\Open\command" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME} %1"

  AccessControl::GrantOnFile "$INSTDIR\resources\app.asar.unpacked\node_modules\java\build\jvm_dll_path.json" "(BU)" "GenericRead + GenericWrite"
  AccessControl::GrantOnFile "$INSTDIR\xlectric.log" "(BU)" "GenericRead + GenericWrite"
  #AccessControl::SetFileOwner "C:\test.txt" "DARKOSSD\Darko"
  Pop $0 ; "error" on errors
!macroend
