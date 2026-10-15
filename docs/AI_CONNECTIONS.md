# Connexions IA dans MeliApp

MeliApp n'affiche un bouton de connexion que lorsqu'un vrai flow délégué est configuré.

## OpenAI / ChatGPT

Pour un site web, Sign in with ChatGPT utilise Authorization Code + PKCE. Le flow web officiel nécessite un backend pour créer et vérifier la transaction OAuth, échanger le code et valider le jeton d'identité. La disponibilité est limitée aux partenaires sélectionnés. Une simple PWA GitHub Pages ne doit donc pas simuler cette connexion.

## Gemini / Google

Gemini prend en charge OAuth, mais l'application doit être enregistrée dans Google Cloud avec un écran de consentement, des identifiants OAuth adaptés et une configuration de production. Tant qu'aucun adaptateur OAuth Google n'est configuré, MeliApp ne prétend pas que le compte est connectable.

## Claude / Anthropic

MeliApp n'active pas de bouton OAuth Claude tant qu'un flow délégué officiel adapté aux applications web tierces n'est pas configuré.

## Règle produit

L'utilisateur final ne saisit jamais de clé API, de jeton ou d'endpoint. Les boutons inactifs affichent clairement « Configuration requise » au lieu d'échouer après clic.
