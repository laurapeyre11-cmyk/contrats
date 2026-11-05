' =============================================================================
' POUSSER_SITE_CONTRATS.vbs
' 1. Envoie VALIDATION_CONTRATS.xlsx (et CONDUCTEURS.xlsx) au site des
'    contrats, qui se met à jour.
' 2. Envoie depuis Outlook, à chaque conducteur qui a de NOUVEAUX contrats,
'    le mail « Contrats intérim à valider » avec son lien personnel vers le
'    site et les PDF signés (dossier TRAITE) en pièces jointes.
'
' A placer dans le même dossier que VALIDATION_CONTRATS.xlsx (#LAURA\Interim).
'
' Lancement :
'  - automatique toutes les 10 minutes (tâche Windows créée par
'    INSTALLER_MISE_A_JOUR_AUTO.vbs) : rien ne s'affiche, et rien n'est
'    envoyé si VALIDATION_CONTRATS.xlsx n'a pas changé ;
'  - à la main par double-clic : envoi immédiat, une fenêtre confirme.
'
' Réglages gardés sur ce PC dans %APPDATA%\STAM\ :
'  site_contrats.ini      adresse du site + code secret (REFRESH_SECRET)
'  contrats_annonces.txt  contrats déjà annoncés aux conducteurs (jamais 2 mails)
'  site_contrats.log      journal des envois
' =============================================================================
Option Explicit

Const TITRE = "Site des contrats intérimaires"
Const EXPEDITEUR = "rh@stam05.fr"

Dim fso, sh, dossier, silencieux, dossierStam
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
dossier = fso.GetParentFolderName(WScript.ScriptFullName)
silencieux = False
If WScript.Arguments.Count > 0 Then silencieux = (LCase(WScript.Arguments(0)) = "/silencieux")
dossierStam = sh.ExpandEnvironmentStrings("%APPDATA%") & "\STAM"
If Not fso.FolderExists(dossierStam) Then fso.CreateFolder dossierStam

Dim fichierConfig, fichierConnus, fichierJournal
fichierConfig = dossierStam & "\site_contrats.ini"
fichierConnus = dossierStam & "\contrats_annonces.txt"
fichierJournal = dossierStam & "\site_contrats.log"

' --- un seul envoi à la fois (tâche automatique + double-clic) -------------
Dim fichierVerrou
fichierVerrou = dossierStam & "\envoi_en_cours.lock"
If fso.FileExists(fichierVerrou) Then
  ' verrou de plus de 15 minutes = envoi précédent interrompu : on l'ignore
  If DateDiff("n", fso.GetFile(fichierVerrou).DateLastModified, Now) < 15 Then
    If Not silencieux Then MsgBox "Une mise à jour du site est déjà en cours. Réessayez dans une minute.", vbInformation, TITRE
    WScript.Quit 3
  End If
End If
fso.CreateTextFile(fichierVerrou, True).Close

Dim adresse, code, derniere, nbEchecs
LireConfig
If adresse = "" Or code = "" Then
  If silencieux Then Journal "Pas encore configuré : lancer POUSSER_SITE_CONTRATS.vbs une fois à la main.": Fin 0
  If adresse = "" Then
    adresse = Trim(InputBox("Adresse du site des contrats (Render, ex. https://contrats.onrender.com) :", TITRE, "https://contrats.onrender.com"))
    If adresse = "" Then Fin 2
    If Right(adresse, 1) = "/" Then adresse = Left(adresse, Len(adresse) - 1)
  End If
  code = Trim(InputBox("Code secret du site (valeur de REFRESH_SECRET dans Render > Environment) :", TITRE))
  If code = "" Then Fin 2
  EcrireConfig
End If

Dim cheminValidation, cheminConducteurs, dateFichier
cheminValidation = dossier & "\VALIDATION_CONTRATS.xlsx"
cheminConducteurs = dossier & "\CONDUCTEURS.xlsx"
If Not fso.FileExists(cheminValidation) Then
  Erreur "Fichier introuvable : " & cheminValidation
End If
dateFichier = CStr(fso.GetFile(cheminValidation).DateLastModified)
If fso.FileExists(cheminConducteurs) Then dateFichier = dateFichier & " | " & CStr(fso.GetFile(cheminConducteurs).DateLastModified)
' en automatique : rien à faire si les fichiers n'ont pas changé depuis le dernier envoi
If silencieux And dateFichier = derniere Then Fin 0

' --- contrats déjà annoncés aux conducteurs --------------------------------
Dim premier, connus
premier = Not fso.FileExists(fichierConnus)
connus = ""
If Not premier Then connus = LireTexte(fichierConnus)

' --- envoi au site ----------------------------------------------------------
Dim corps
corps = "{""mails"":true,""validation"":""" & LireBase64(cheminValidation) & """"
If fso.FileExists(cheminConducteurs) Then corps = corps & ",""conducteurs"":""" & LireBase64(cheminConducteurs) & """"
If Not premier Then corps = corps & ",""connus"":""" & JsonTexte(Replace(connus, vbCrLf, "|")) & """"
corps = corps & "}"

' le site gratuit peut mettre jusqu'à une minute à se réveiller : 3 essais
Dim statut, reponse, essai
For essai = 1 To 3
  Envoyer corps, statut, reponse
  If statut = 200 Or statut = 400 Or statut = 401 Then Exit For
  WScript.Sleep 10000
Next

' --- lecture de la réponse ------------------------------------------------
Dim lignes, ligne, champs, message, nouveauxConnus, mails(), nbMails
message = "": nouveauxConnus = "": nbMails = 0
ReDim mails(0)
lignes = Split(Replace(reponse, vbCr, ""), vbLf)
For Each ligne In lignes
  champs = Split(ligne, vbTab)
  If UBound(champs) >= 1 Then
    Select Case champs(0)
      Case "MESSAGE": message = DecodeB64(champs(1))
      Case "CONNUS": nouveauxConnus = DecodeB64(champs(1))
      Case "MAIL"
        If UBound(champs) >= 4 Then
          ReDim Preserve mails(nbMails)
          mails(nbMails) = Array(DecodeB64(champs(1)), DecodeB64(champs(2)), DecodeB64(champs(3)), DecodeB64(champs(4)))
          nbMails = nbMails + 1
        End If
    End Select
  End If
Next
If message = "" Then message = Left(reponse, 300)

If statut = 401 Then
  If Not silencieux Then code = "": EcrireConfig
  Erreur "Le code secret est incorrect : le site n'a pas été mis à jour." & vbCrLf & _
    "Double-cliquez sur POUSSER_SITE_CONTRATS.vbs et saisissez la valeur de REFRESH_SECRET (Render > Environment)."
ElseIf statut = 0 Then
  Erreur "Le site ne répond pas (connexion internet, ou site en panne) : il n'a pas été mis à jour." & vbCrLf & message
ElseIf statut <> 200 Then
  Erreur "Le site n'a pas pu être mis à jour (code " & statut & ")." & vbCrLf & message
End If
Journal "Site mis à jour : " & message
nbEchecs = 0

' --- mails aux conducteurs ------------------------------------------------
Dim envoyes, brouillons, echecs, i, rapportMails
envoyes = 0: brouillons = 0: echecs = ""
If nbMails > 0 Then
  Dim faireEnvoi
  faireEnvoi = True
  If premier Then
    ' tout premier envoi : un mail de lancement par conducteur, avec son lien
    ' (question posée aussi en automatique : la tâche tourne dans la session)
    faireEnvoi = (MsgBox("Le site est à jour." & vbCrLf & vbCrLf & _
      "Envoyer maintenant à chaque conducteur (" & nbMails & ") un mail avec son lien personnel vers le site ?" & vbCrLf & vbCrLf & _
      "Oui : ils reçoivent leur lien tout de suite." & vbCrLf & _
      "Non : ils le recevront avec leur prochain contrat signé." & vbCrLf & vbCrLf & _
      "Ensuite, chaque nouveau contrat signé leur sera envoyé automatiquement.", vbYesNo + vbQuestion, TITRE) = vbYes)
  End If
  If faireEnvoi Then
    Dim ol
    Set ol = Nothing
    On Error Resume Next
    Set ol = CreateObject("Outlook.Application")
    On Error GoTo 0
    If ol Is Nothing Then
      echecs = "Outlook n'a pas pu être ouvert : aucun mail envoyé."
    Else
      For i = 0 To nbMails - 1
        EnvoyerMail ol, mails(i)(0), mails(i)(1), mails(i)(2), mails(i)(3)
      Next
      AttendreBoiteEnvoi ol
    End If
  End If
End If

' on retient les contrats annoncés seulement si les mails sont partis (ou
' volontairement pas envoyés au premier lancement)
If nouveauxConnus <> "" And echecs = "" Then EcrireTexte fichierConnus, Replace(nouveauxConnus, vbLf, vbCrLf)
' en cas d'échec Outlook, on réessaiera au prochain passage
If echecs = "" Then derniere = dateFichier
EcrireConfig

rapportMails = ""
If envoyes > 0 Then rapportMails = rapportMails & vbCrLf & envoyes & " mail(s) envoyé(s) aux conducteurs."
If brouillons > 0 Then rapportMails = rapportMails & vbCrLf & brouillons & " mail(s) n'ont pas pu partir : ils sont dans vos Brouillons Outlook."
If echecs <> "" Then rapportMails = rapportMails & vbCrLf & echecs
If rapportMails <> "" Then Journal Replace(rapportMails, vbCrLf, " ")

If Not silencieux Then
  MsgBox "Site des contrats mis à jour." & vbCrLf & vbCrLf & message & vbCrLf & rapportMails, vbInformation, TITRE
ElseIf brouillons > 0 Or echecs <> "" Or InStr(message, "ATTENTION") > 0 Then
  MsgBox message & vbCrLf & rapportMails, vbExclamation, TITRE
End If
Fin 0

' ============================================================================
Sub EnvoyerMail(ol, a, objet, html, pjs)
  Dim m, nom, chemin, compte, c
  Set m = ol.CreateItem(0)
  m.To = a
  m.Subject = objet
  m.HTMLBody = html
  ' expéditeur rh@stam05.fr si cette boîte est dans Outlook
  Set compte = Nothing
  On Error Resume Next
  For Each c In ol.Session.Accounts
    If LCase(c.SmtpAddress) = EXPEDITEUR Then Set compte = c
  Next
  If Not compte Is Nothing Then
    Set m.SendUsingAccount = compte
  Else
    m.SentOnBehalfOfName = EXPEDITEUR
  End If
  Err.Clear
  On Error GoTo 0
  For Each nom In Split(pjs, "|")
    If nom <> "" Then
      chemin = dossier & "\TRAITE\" & nom
      If fso.FileExists(chemin) Then m.Attachments.Add chemin
    End If
  Next
  On Error Resume Next
  m.Send
  If Err.Number <> 0 Then
    Err.Clear
    m.Save
    brouillons = brouillons + 1
    Journal "Mail non parti (gardé en brouillon) : " & a & " - " & objet
  Else
    envoyes = envoyes + 1
    Journal "Mail envoyé : " & a & " - " & objet
  End If
  On Error GoTo 0
End Sub

' Outlook ouvert par le script peut se refermer avant d'avoir tout envoyé :
' on attend que la boîte d'envoi soit vide (1 min 30 au plus).
Sub AttendreBoiteEnvoi(ol)
  Dim boite, t
  On Error Resume Next
  ol.Session.SendAndReceive False
  Set boite = ol.Session.GetDefaultFolder(4)
  For t = 1 To 45
    If boite.Items.Count = 0 Then Exit For
    WScript.Sleep 2000
  Next
  If boite.Items.Count > 0 Then Journal "Attention : " & boite.Items.Count & " mail(s) encore dans la boîte d'envoi d'Outlook."
  On Error GoTo 0
End Sub

' fin du script : on libère le verrou
Sub Fin(codeSortie)
  On Error Resume Next
  If fso.FileExists(fichierVerrou) Then fso.DeleteFile fichierVerrou, True
  On Error GoTo 0
  WScript.Quit codeSortie
End Sub

Sub Envoyer(texte, ByRef st, ByRef rep)
  Dim http
  On Error Resume Next
  Set http = CreateObject("MSXML2.ServerXMLHTTP.6.0")
  http.setTimeouts 30000, 90000, 180000, 180000
  http.open "POST", adresse & "/api/import-excel?format=vbs", False
  http.setRequestHeader "Content-Type", "application/json"
  http.setRequestHeader "x-refresh-token", code
  http.send texte
  If Err.Number <> 0 Then
    st = 0: rep = "Erreur réseau : " & Err.Description
    Err.Clear
  Else
    st = http.status: rep = http.responseText
  End If
  On Error GoTo 0
End Sub

' En automatique, on prévient à la 3e erreur d'affilée (30 min), puis
' toutes les 3 heures, pour ne pas afficher une fenêtre toutes les 10 min.
Sub Erreur(texte)
  Journal "ERREUR : " & Replace(texte, vbCrLf, " ")
  nbEchecs = nbEchecs + 1
  EcrireConfig
  If Not silencieux Then
    MsgBox texte, vbExclamation, TITRE
  ElseIf nbEchecs Mod 18 = 3 Then
    MsgBox texte & vbCrLf & vbCrLf & "(Mise à jour automatique : " & nbEchecs & " essais ratés d'affilée. Journal : " & fichierJournal & ")", vbExclamation, TITRE
  End If
  Fin 1
End Sub

Function LireBase64(chemin)
  ' copie temporaire : le fichier peut être ouvert dans Excel
  Dim tmp, st, xml, el
  tmp = fso.GetSpecialFolder(2) & "\" & fso.GetTempName
  fso.CopyFile chemin, tmp, True
  Set st = CreateObject("ADODB.Stream")
  st.Type = 1: st.Open: st.LoadFromFile tmp
  Set xml = CreateObject("MSXML2.DOMDocument.6.0")
  Set el = xml.createElement("b")
  el.DataType = "bin.base64"
  el.NodeTypedValue = st.Read
  st.Close
  fso.DeleteFile tmp, True
  LireBase64 = Replace(Replace(el.Text, vbLf, ""), vbCr, "")
End Function

Function DecodeB64(b64)
  ' base64 -> texte UTF-8 (garde les accents)
  Dim xml, el, st
  If b64 = "" Then DecodeB64 = "": Exit Function
  Set xml = CreateObject("MSXML2.DOMDocument.6.0")
  Set el = xml.createElement("b")
  el.DataType = "bin.base64"
  el.Text = b64
  Set st = CreateObject("ADODB.Stream")
  st.Type = 1: st.Open: st.Write el.NodeTypedValue
  st.Position = 0: st.Type = 2: st.Charset = "utf-8"
  DecodeB64 = st.ReadText
  st.Close
End Function

Function JsonTexte(t)
  JsonTexte = Replace(Replace(t, "\", "\\"), """", "\""")
End Function

Function LireTexte(chemin)
  Dim f
  Set f = fso.OpenTextFile(chemin, 1, False, -1)
  If f.AtEndOfStream Then LireTexte = "" Else LireTexte = f.ReadAll
  f.Close
End Function

Sub EcrireTexte(chemin, t)
  Dim f
  Set f = fso.CreateTextFile(chemin, True, True)
  f.Write t
  f.Close
End Sub

Sub Journal(t)
  Dim f
  On Error Resume Next
  Set f = fso.OpenTextFile(fichierJournal, 8, True, -1)
  f.WriteLine Now & "  " & t
  f.Close
  On Error GoTo 0
End Sub

Sub LireConfig()
  Dim f, l
  adresse = "": code = "": derniere = "": nbEchecs = 0
  If Not fso.FileExists(fichierConfig) Then Exit Sub
  Set f = fso.OpenTextFile(fichierConfig, 1)
  Do Until f.AtEndOfStream
    l = f.ReadLine
    If Left(l, 8) = "adresse=" Then adresse = Trim(Mid(l, 9))
    If Left(l, 5) = "code=" Then code = Trim(Mid(l, 6))
    If Left(l, 9) = "derniere=" Then derniere = Trim(Mid(l, 10))
    If Left(l, 7) = "echecs=" And IsNumeric(Mid(l, 8)) Then nbEchecs = CLng(Mid(l, 8))
  Loop
  f.Close
End Sub

Sub EcrireConfig()
  Dim f
  Set f = fso.CreateTextFile(fichierConfig, True)
  f.WriteLine "adresse=" & adresse
  f.WriteLine "code=" & code
  f.WriteLine "derniere=" & derniere
  f.WriteLine "echecs=" & nbEchecs
  f.Close
End Sub
