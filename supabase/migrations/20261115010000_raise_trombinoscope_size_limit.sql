-- Retour de Cindy du 05/10 ("Envoi impossible, réessaie" sur U18M) :
-- Séniors M faisait déjà 9,16 Mo (juste sous l'ancienne limite de 10 Mo),
-- U18M la dépasse. Un trombinoscope avec 25-30 photos de joueurs peut
-- facilement dépasser 10 Mo -- relevé à 25 Mo, marge confortable pour ce
-- type de document.
update storage.buckets
set file_size_limit = 26214400
where id = 'team-trombinoscopes';
