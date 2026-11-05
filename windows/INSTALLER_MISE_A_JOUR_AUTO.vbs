' =============================================================================
' INSTALLER_MISE_A_JOUR_AUTO.vbs  (à lancer UNE SEULE FOIS, sur le PC de RH)
' 1. Premier envoi au site (demande l'adresse du site et le code secret),
'    avec proposition d'envoyer à chaque conducteur le mail avec son lien.
' 2. Crée une tâche Windows « STAM - Site contrats » qui, toutes les
'    10 minutes (et à l'ouverture de session), met le site à jour et envoie
'    les mails des nouveaux contrats si VALIDATION_CONTRATS.xlsx a changé
'    (donc après chaque passage du moteur V6). Rien ne s'affiche quand tout
'    va bien. Elle tourne aussi sur batterie (PC portable).
' Pour arrêter : relancer ce fichier et répondre « Non » à la question.
' =============================================================================
Option Explicit
Const TITRE = "Site des contrats intérimaires"
Const TACHE = "STAM - Site contrats"
Dim fso, sh, dossier, script, rc, xml, fichierXml, cmd
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

' 1. premier envoi, à l'écran (0 = réussi, 2 = annulé, autre = échec)
rc = sh.Run("wscript.exe //nologo """ & script & """", 1, True)
If rc = 2 Then
  MsgBox "Installation annulée : rien n'a été modifié.", vbInformation, TITRE
  WScript.Quit
ElseIf rc <> 0 Then
  If MsgBox("Le premier envoi n'a pas abouti (voir le message précédent)." & vbCrLf & vbCrLf & _
    "Installer quand même la mise à jour automatique ? Elle réessaiera toute seule toutes les 10 minutes.", vbYesNo + vbQuestion, TITRE) = vbNo Then WScript.Quit
End If

' 2. la tâche planifiée, décrite en XML pour pouvoir tourner sur batterie
xml = "<?xml version=""1.0"" encoding=""UTF-16""?>" & vbCrLf & _
  "<Task version=""1.2"" xmlns=""http://schemas.microsoft.com/windows/2004/02/mit/task"">" & _
  "<RegistrationInfo><Description>Met à jour le site des contrats intérimaires et envoie les mails aux conducteurs.</Description></RegistrationInfo>" & _
  "<Triggers>" & _
    "<TimeTrigger><Repetition><Interval>PT10M</Interval><StopAtDurationEnd>false</StopAtDurationEnd></Repetition>" & _
    "<StartBoundary>" & DateIso(Now) & "</StartBoundary><Enabled>true</Enabled></TimeTrigger>" & _
    "<LogonTrigger><Enabled>true</Enabled><UserId>" & XmlTexte(UtilisateurCourant()) & "</UserId><Delay>PT2M</Delay></LogonTrigger>" & _
  "</Triggers>" & _
  "<Principals><Principal id=""Author""><LogonType>InteractiveToken</LogonType><RunLevel>LeastPrivilege</RunLevel></Principal></Principals>" & _
  "<Settings>" & _
    "<MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>" & _
    "<DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>" & _
    "<StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>" & _
    "<StartWhenAvailable>true</StartWhenAvailable>" & _
    "<ExecutionTimeLimit>PT1H</ExecutionTimeLimit>" & _
    "<Enabled>true</Enabled>" & _
  "</Settings>" & _
  "<Actions Context=""Author""><Exec><Command>wscript.exe</Command>" & _
    "<Arguments>//nologo """ & XmlTexte(script) & """ /silencieux</Arguments></Exec></Actions>" & _
  "</Task>"
fichierXml = fso.GetSpecialFolder(2) & "\stam_site_contrats_tache.xml"
With fso.CreateTextFile(fichierXml, True, True) ' Unicode (UTF-16), comme annoncé dans le XML
  .Write xml
  .Close
End With
rc = sh.Run("schtasks /Create /F /TN """ & TACHE & """ /XML """ & fichierXml & """", 0, True)
If rc <> 0 Then
  ' repli : tâche simple (ne tourne que sur secteur pour un PC portable)
  cmd = "schtasks /Create /F /SC MINUTE /MO 10 /TN """ & TACHE & """ /TR ""wscript.exe //nologo \""" & script & "\"" /silencieux"""
  rc = sh.Run(cmd, 0, True)
End If
On Error Resume Next
fso.DeleteFile fichierXml, True
On Error GoTo 0

If rc = 0 Then
  MsgBox "C'est installé." & vbCrLf & vbCrLf & _
    "Toutes les 10 minutes, si VALIDATION_CONTRATS.xlsx a changé, le site se met à jour et les conducteurs reçoivent le mail de leurs nouveaux contrats." & vbCrLf & vbCrLf & _
    "Pour une mise à jour immédiate : double-clic sur POUSSER_SITE_CONTRATS.vbs.", vbInformation, TITRE
Else
  MsgBox "La tâche Windows n'a pas pu être créée (code " & rc & ")." & vbCrLf & _
    "Le site reste à jour, mais il faudra double-cliquer sur POUSSER_SITE_CONTRATS.vbs après chaque passage du moteur." & vbCrLf & _
    "Prévenez la personne qui gère l'informatique, ou Claude.", vbExclamation, TITRE
End If

Function DateIso(d)
  DateIso = Year(d) & "-" & Right("0" & Month(d), 2) & "-" & Right("0" & Day(d), 2) & "T" & _
    Right("0" & Hour(d), 2) & ":" & Right("0" & Minute(d), 2) & ":00"
End Function

Function UtilisateurCourant()
  Dim reseau
  Set reseau = CreateObject("WScript.Network")
  UtilisateurCourant = reseau.UserDomain & "\" & reseau.UserName
End Function

Function XmlTexte(t)
  XmlTexte = Replace(Replace(Replace(Replace(t, "&", "&amp;"), "<", "&lt;"), ">", "&gt;"), """", "&quot;")
End Function
