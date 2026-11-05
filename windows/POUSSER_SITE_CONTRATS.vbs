' =============================================================================
' POUSSER_SITE_CONTRATS.vbs
' Envoie VALIDATION_CONTRATS.xlsx (et CONDUCTEURS.xlsx) au site des contrats.
' A placer dans le meme dossier que VALIDATION_CONTRATS.xlsx (#LAURA\Interim).
' Lance automatiquement par LANCER_MOTEUR_V6_ET_SITE.vbs, ou a la main par
' double-clic (par exemple apres une modification du fichier Excel).
'
' Au premier lancement, demande l'adresse du site et le code REFRESH_SECRET
' (Render > service contrats > Environment), puis les garde sur ce PC dans
' %APPDATA%\STAM\site_contrats.ini.
' Avec l'argument /silencieux : pas de fenetre si tout s'est bien passe.
' =============================================================================
Option Explicit

Dim fso, sh, dossier, silencieux
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
dossier = fso.GetParentFolderName(WScript.ScriptFullName)
silencieux = False
If WScript.Arguments.Count > 0 Then silencieux = (LCase(WScript.Arguments(0)) = "/silencieux")

Const TITRE = "Site des contrats intérimaires"

Dim fichierConfig, adresse, code
fichierConfig = sh.ExpandEnvironmentStrings("%APPDATA%") & "\STAM\site_contrats.ini"
LireConfig

If adresse = "" Or code = "" Then
  adresse = InputBox("Adresse du site des contrats :", TITRE, "https://contrats.onrender.com")
  If adresse = "" Then WScript.Quit
  code = InputBox("Code secret du site (valeur de REFRESH_SECRET dans Render > Environment) :", TITRE)
  If code = "" Then WScript.Quit
  If Right(adresse, 1) = "/" Then adresse = Left(adresse, Len(adresse) - 1)
  EcrireConfig
End If

Dim cheminValidation, cheminConducteurs
cheminValidation = dossier & "\VALIDATION_CONTRATS.xlsx"
cheminConducteurs = dossier & "\CONDUCTEURS.xlsx"
If Not fso.FileExists(cheminValidation) Then
  MsgBox "Fichier introuvable :" & vbCrLf & cheminValidation & vbCrLf & vbCrLf & _
    "Le site n'a pas été mis à jour.", vbExclamation, TITRE
  WScript.Quit 1
End If

Dim corps
corps = "{""validation"":""" & LireBase64(cheminValidation) & """"
If fso.FileExists(cheminConducteurs) Then corps = corps & ",""conducteurs"":""" & LireBase64(cheminConducteurs) & """"
corps = corps & "}"

' Le site gratuit peut mettre jusqu'à une minute à se réveiller : 2 essais.
Dim statut, reponse, essai
For essai = 1 To 2
  Envoyer corps, statut, reponse
  If statut = 200 Or statut = 400 Or statut = 401 Then Exit For
  WScript.Sleep 5000
Next

Dim message
message = ExtraireMessage(reponse)
If statut = 200 Then
  If Not silencieux Or InStr(reponse, """sauvegarde"":false") > 0 Then
    MsgBox "Site des contrats mis à jour." & vbCrLf & vbCrLf & message, vbInformation, TITRE
  End If
ElseIf statut = 401 Then
  ' code faux : on l'oublie pour le redemander au prochain lancement
  code = "": EcrireConfig
  MsgBox "Le code secret est incorrect : le site n'a pas été mis à jour." & vbCrLf & vbCrLf & _
    "Relancez POUSSER_SITE_CONTRATS.vbs et saisissez la valeur de REFRESH_SECRET (Render > Environment).", vbExclamation, TITRE
  WScript.Quit 1
Else
  MsgBox "Le site n'a pas pu être mis à jour (code " & statut & ")." & vbCrLf & vbCrLf & message & vbCrLf & vbCrLf & _
    "Vérifiez la connexion internet puis relancez POUSSER_SITE_CONTRATS.vbs.", vbExclamation, TITRE
  WScript.Quit 1
End If

' ----------------------------------------------------------------------------
Sub Envoyer(texte, ByRef st, ByRef rep)
  Dim http
  On Error Resume Next
  Set http = CreateObject("MSXML2.ServerXMLHTTP.6.0")
  http.setTimeouts 30000, 90000, 180000, 180000
  http.open "POST", adresse & "/api/import-excel", False
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

Function ExtraireMessage(json)
  Dim re, m
  Set re = New RegExp
  re.Pattern = """message"":""([^""]*)"""
  Set m = re.Execute(json)
  If m.Count > 0 Then
    ExtraireMessage = m(0).SubMatches(0)
  Else
    ExtraireMessage = Left(json, 300)
  End If
End Function

Sub LireConfig()
  Dim f, ligne
  adresse = "": code = ""
  If Not fso.FileExists(fichierConfig) Then Exit Sub
  Set f = fso.OpenTextFile(fichierConfig, 1)
  Do Until f.AtEndOfStream
    ligne = f.ReadLine
    If Left(ligne, 8) = "adresse=" Then adresse = Trim(Mid(ligne, 9))
    If Left(ligne, 5) = "code=" Then code = Trim(Mid(ligne, 6))
  Loop
  f.Close
End Sub

Sub EcrireConfig()
  Dim d, f
  d = fso.GetParentFolderName(fichierConfig)
  If Not fso.FolderExists(d) Then fso.CreateFolder d
  Set f = fso.CreateTextFile(fichierConfig, True)
  f.WriteLine "adresse=" & adresse
  f.WriteLine "code=" & code
  f.Close
End Sub
