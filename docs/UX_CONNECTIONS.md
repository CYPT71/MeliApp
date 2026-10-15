# UX des connexions

Cette note décrit les règles d’interface attendues pour les connexions externes.

## Outlook

Outlook est uniquement le calendrier de MeliApp.

- L’utilisateur voit « Connecter mon calendrier Outlook ».
- Il ne voit jamais de message technique du type « Client ID non configuré ».
- La configuration du `client_id` Microsoft appartient au déploiement de MeliApp et non à l’utilisateur final.
- Les détails de configuration manquante restent disponibles dans Diagnostics pour le développeur.
- En cas de configuration absente ou invalide, l’interface affiche un message produit neutre : « La connexion Outlook n’est pas disponible pour le moment. »

## IA

L’interface utilisateur présente GPT, Claude et Gemini comme des **connexions**, pas comme des formulaires de clés API.

- une carte par fournisseur ;
- état « Non connecté » / « Connecté » / « Indisponible » ;
- bouton « Connecter » ou « Déconnecter » ;
- aucun champ de clé API, modèle ou endpoint dans l’interface normale ;
- les détails techniques éventuels appartiennent à la configuration du déploiement ou à Diagnostics.

La couche `services.ai` reste responsable de l’authentification réelle. Une connexion n’est considérée comme active que si le service peut fournir un jeton/credential valide pour le fournisseur concerné.
