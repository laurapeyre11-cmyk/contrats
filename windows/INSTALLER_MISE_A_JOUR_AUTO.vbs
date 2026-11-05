' =============================================================================
' INSTALLER_MISE_A_JOUR_AUTO.vbs  (à lancer UNE SEULE FOIS, sur le PC de RH)
' 1. Premier envoi au site (demande l'adresse du site et le code secret),
'    avec proposition d'envoyer à chaque conducteur le mail avec son lien.
' 2. Crée une tâche Windows « STAM - Site contrats » qui, toutes les
'    10 minutes, met le site à jour et envoie les mails des nouveaux
'    contrats si VALIDATION_CONTRATS.xlsx a changé (donc après chaque
'    passage du moteur V6). Rien ne s'affiche quand tout va bien.
' Pour arrêter : relancer ce fichier et répondre « Non » à la question.
' =============================================================================
Option Explicit
Const TITRE = "Site des contrats intérimaires"
Const TACHE = "STAM - Site contrats"
Dim fso, sh, dossier, script, cmd, rc
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
dossier = fso.GetParentFolderName(WScript.ScriptFullName)
script = dossier & "\POUSSER_SITE_CONTRATS.vbs"
If Not fso.FileExists(script) Then
  MsgBox "POUSSER_SITE_CONTRATS.vbs introuvable dans :" & vbCrLf & dossier, vbExclamation, TITRE
  WScript.Quit 1
End If

If MsgBox("Mettre à jour le site automatiquement, toutes les 10 minutes, après chaque passage du moteur V6 ?" & vbCrLf & vbCrLf & _
  "(Oui = installer   /   Non = arrêter la mise à jour automatique)", vbYesNo + vbQuestion, TITRE) = vbNo Then
  sh.Run "schtasks /Delete /F /TN """ & TACHE & """", 0, True
  MsgBox "Mise à jour automatique arrêtée.", vbInformation, TITRE
  WScript.Quit
End If

' 1. premier envoi, à l'écran
sh.Run "wscript.exe //nologo """ & script & """", 1, True

' 2. la tâche planifiée (utilisateur courant, quand la session est ouverte)
cmd = "schtasks /Create /F /SC MINUTE /MO 10 /TN """ & TACHE & """ /TR ""wscript.exe //nologo \""" & script & "\"" /silencieux"""
rc = sh.Run(cmd, 0, True)
If rc = 0 Then
  MsgBox "C'est installé." & vbCrLf & vbCrLf & _
    "Toutes les 10 minutes, si VALIDATION_CONTRATS.xlsx a changé, le site se met à jour et les conducteurs reçoivent le mail de leurs nouveaux contrats." & vbCrLf & vbCrLf & _
    "Pour une mise à jour immédiate : double-clic sur POUSSER_SITE_CONTRATS.vbs.", vbInformation, TITRE
Else
  MsgBox "La tâche Windows n'a pas pu être créée (code " & rc & ")." & vbCrLf & _
    "Commande à lancer dans une invite de commandes :" & vbCrLf & vbCrLf & cmd, vbExclamation, TITRE
End If
