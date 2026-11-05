' =============================================================================
' LANCER_MOTEUR_V6_ET_SITE.vbs
' A utiliser A LA PLACE de STAM_MOTEUR_V6.vbs :
'   1. lance STAM_MOTEUR_V6.vbs et attend qu'il ait fini ;
'   2. met à jour le site des contrats avec VALIDATION_CONTRATS.xlsx.
' A placer dans le même dossier que STAM_MOTEUR_V6.vbs (#LAURA\Interim).
' =============================================================================
Option Explicit

Dim fso, sh, dossier
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
dossier = fso.GetParentFolderName(WScript.ScriptFullName)

If Not fso.FileExists(dossier & "\STAM_MOTEUR_V6.vbs") Then
  MsgBox "STAM_MOTEUR_V6.vbs introuvable dans :" & vbCrLf & dossier, vbExclamation, "Moteur V6"
  WScript.Quit 1
End If

' 1. le moteur, en attendant qu'il se termine
sh.Run "wscript.exe //nologo """ & dossier & "\STAM_MOTEUR_V6.vbs""", 1, True

' 2. le site (une fenêtre confirme la mise à jour)
sh.Run "wscript.exe //nologo """ & dossier & "\POUSSER_SITE_CONTRATS.vbs""", 1, True
