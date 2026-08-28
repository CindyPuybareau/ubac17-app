-- Trouvé lors de l'audit du 28/08 : le bucket avatars n'avait ni limite de
-- taille ni liste de formats autorisés — seule la vérification faite dans
-- le navigateur (avatar-upload.tsx, "if (!file.type.startsWith('image/'))")
-- retenait quoi que ce soit, et elle est purement côté client, donc sans
-- valeur face à quelqu'un qui enverrait directement une requête au
-- Storage. Un compte connecté pouvait poser n'importe quel fichier
-- (n'importe quel type, n'importe quelle taille) sous son propre dossier,
-- servi publiquement depuis le domaine Supabase du club.
--
-- Décision de Cindy (28/08) : la lecture publique reste nécessaire (photos
-- affichées sans dispositif d'authentification à chaque affichage) — on
-- ferme seulement l'écriture non bornée. Formats couverts : webp/jpeg (ce
-- que produit resizeImageForAvatar dans le cas normal) + png/gif/heic/heif
-- (ce que le navigateur peut encore envoyer tel quel via son repli quand
-- il ne sait pas décoder le fichier dans un <canvas>, voir
-- image-resize.ts). 5 Mo : largement au-dessus d'un avatar recadré à
-- 256px (quelques dizaines de Ko), mais couvre sans souci une photo de
-- téléphone non redimensionnée par ce repli.
update storage.buckets
set
  file_size_limit = 5242880,
  allowed_mime_types = array[
    'image/webp', 'image/jpeg', 'image/png', 'image/gif', 'image/heic', 'image/heif'
  ]
where id = 'avatars';
