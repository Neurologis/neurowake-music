-- Seed 50 conseils (5 phases × 10 FR + traductions ES + EN)

-- ============ FRANÇAIS ============

-- MATIN
INSERT INTO conseils (phase, langue, texte, ordre) VALUES
('matin', 'fr', 'Le matin est souvent le meilleur moment pour éveiller les souvenirs musicaux. Prenez le temps d''être présent.', 0),
('matin', 'fr', 'Chantonnez doucement avec la musique si votre proche le fait — c''est un moment de connexion précieux.', 1),
('matin', 'fr', 'La routine musicale du matin aide à structurer la journée. Essayez de la maintenir aux mêmes horaires.', 2),
('matin', 'fr', 'Observez les réactions de votre proche : sourire, mouvement des doigts, balancement... ce sont des signes positifs.', 3),
('matin', 'fr', 'Vous n''avez pas besoin de parler pendant la musique. Votre présence bienveillante suffit.', 4),
('matin', 'fr', 'Si votre proche ferme les yeux, c''est souvent signe qu''il ou elle savoure la musique. C''est bon signe !', 5),
('matin', 'fr', 'Les titres du matin peuvent être légèrement plus rythmés pour une mise en énergie douce.', 6),
('matin', 'fr', 'Prenez soin de vous aussi. Prendre du temps pour la musique ensemble, c''est du bien-être pour vous deux.', 7),
('matin', 'fr', 'Si votre proche bouge les lèvres, encouragez-le doucement. La mémoire des paroles est souvent intacte.', 8),
('matin', 'fr', 'La régularité est la clé. Même une session courte de 10 minutes peut avoir un impact positif.', 9);

-- SOINS
INSERT INTO conseils (phase, langue, texte, ordre) VALUES
('soins', 'fr', 'La musique pendant les soins peut réduire l''inconfort et faciliter la coopération. Choisissez des mélodies familières.', 0),
('soins', 'fr', 'Parlez calmement et expliquez chaque geste avant de le faire. La musique crée un cadre rassurant.', 1),
('soins', 'fr', 'Si votre proche s''agite, baissez la luminosité et laissez la musique guider l''atmosphère.', 2),
('soins', 'fr', 'Un rythme lent et régulier dans la musique peut synchroniser la respiration et calmer les tensions.', 3),
('soins', 'fr', 'La chanson préférée peut devenir un signal rassurant qui annonce le début d''un moment de soins.', 4),
('soins', 'fr', 'Si la résistance est forte, essayez de fredonner vous-même une mélodie connue. Ça peut désamorcer la situation.', 5),
('soins', 'fr', 'Les soins sont aussi des moments de contact. La musique les rend plus humains pour vous deux.', 6),
('soins', 'fr', 'N''hésitez pas à nommer les chansons : "Tu te souviens de cette chanson ?" pour engager la conversation.', 7),
('soins', 'fr', 'Gardez le volume doux pendant les soins — l''objectif est d''apaiser, pas de stimuler.', 8),
('soins', 'fr', 'Après les soins, une chanson joyeuse peut marquer une transition positive vers la suite de la journée.', 9);

-- REPAS
INSERT INTO conseils (phase, langue, texte, ordre) VALUES
('repas', 'fr', 'La musique pendant les repas peut améliorer l''appétit et ralentir le rythme de consommation.', 0),
('repas', 'fr', 'Évitez les musiques trop stimulantes à table — l''objectif est une ambiance conviviale et douce.', 1),
('repas', 'fr', 'Si votre proche chantonne en mangeant, c''est une belle interaction. Laissez-le faire.', 2),
('repas', 'fr', 'Les musiques liées à des souvenirs de repas en famille peuvent créer une atmosphère chaleureuse.', 3),
('repas', 'fr', 'Mangez ensemble quand c''est possible. La musique transforme un repas en moment partagé.', 4),
('repas', 'fr', 'Si l''appétit est faible, une chanson favorite peut parfois relancer l''intérêt pour le repas.', 5),
('repas', 'fr', 'Nommez ce que vous servez en rythme avec la musique — c''est ludique et stimulant.', 6),
('repas', 'fr', 'Un volume légèrement bas permet la musique en fond sans interférer avec la déglutition.', 7),
('repas', 'fr', 'Les chansons de table ou d''accordéon peuvent évoquer des repas de fête mémorables.', 8),
('repas', 'fr', 'Terminer le repas sur une note musicale positive prépare bien la suite de la journée.', 9);

-- APRÈS-MIDI
INSERT INTO conseils (phase, langue, texte, ordre) VALUES
('apres-midi', 'fr', 'L''après-midi est idéal pour les souvenirs musicaux — ni trop tôt, ni trop tard dans la journée.', 0),
('apres-midi', 'fr', 'Proposez à votre proche de "voter" pour la prochaine chanson avec un geste ou un sourire.', 1),
('apres-midi', 'fr', 'La musique de l''après-midi peut accompagner une activité douce : feuilleter des photos, tricoter, se promener.', 2),
('apres-midi', 'fr', 'Les souvenirs de bal, de fête ou de danse sont souvent vifs. Les musiques associées peuvent les ranimer.', 3),
('apres-midi', 'fr', 'Un court moment musical peut couper positivement l''après-midi et prévenir la fatigue cognitive.', 4),
('apres-midi', 'fr', 'Si vous remarquez une émotion forte — larmes ou sourire intense — c''est signe d''une connexion profonde.', 5),
('apres-midi', 'fr', 'N''interprétez pas les larmes comme de la tristesse — elles expriment souvent une émotion belle et intense.', 6),
('apres-midi', 'fr', 'Adaptez le rythme de la playlist à l''énergie du moment : tempo plus calme si votre proche est fatigué.', 7),
('apres-midi', 'fr', 'L''heure du goûter associée à une chanson peut créer un rituel agréable et attendu chaque jour.', 8),
('apres-midi', 'fr', 'Partagez vos propres émotions : "Cette chanson me fait penser à..." — votre proche appréciera la connexion.', 9);

-- COUCHER
INSERT INTO conseils (phase, langue, texte, ordre) VALUES
('coucher', 'fr', 'La musique du soir doit être plus lente et apaisante pour préparer le corps et l''esprit au repos.', 0),
('coucher', 'fr', 'Un rituel musical régulier avant le coucher signal au cerveau que la nuit approche.', 1),
('coucher', 'fr', 'Les berceuses ou les ballades douces des années de jeunesse sont particulièrement adaptées au soir.', 2),
('coucher', 'fr', 'Diminuez progressivement le volume au fil de la playlist pour accompagner l''endormissement.', 3),
('coucher', 'fr', 'Un message vocal de bonne nuit, dans votre voix, peut rassurer avant le sommeil.', 4),
('coucher', 'fr', 'Évitez les changements brusques de tempo en fin de playlist — la continuité aide à la détente.', 5),
('coucher', 'fr', 'Si votre proche s''endort avec la musique, c''est un signe de confiance et de bien-être.', 6),
('coucher', 'fr', 'Prenez un moment pour vous après avoir lancé la playlist du soir — vous aussi méritez de vous reposer.', 7),
('coucher', 'fr', 'La régularité de l''heure et de la musique du coucher peut améliorer la qualité du sommeil.', 8),
('coucher', 'fr', 'Finir la journée sur une note musicale positive est un cadeau que vous offrez à votre proche chaque soir.', 9);

-- ============ ESPAÑOL ============

INSERT INTO conseils (phase, langue, texte, ordre) VALUES
('matin', 'es', 'La mañana es el mejor momento para despertar los recuerdos musicales. Tómese su tiempo para estar presente.', 0),
('soins', 'es', 'La música durante los cuidados puede reducir la incomodidad y facilitar la cooperación.', 0),
('repas', 'es', 'La música durante las comidas puede mejorar el apetito y hacer el momento más agradable.', 0),
('apres-midi', 'es', 'La tarde es ideal para los recuerdos musicales — ni demasiado temprano ni demasiado tarde.', 0),
('coucher', 'es', 'La música nocturna debe ser más lenta y tranquilizadora para preparar el cuerpo al descanso.', 0);

-- ============ ENGLISH ============

INSERT INTO conseils (phase, langue, texte, ordre) VALUES
('matin', 'en', 'Morning is often the best time to awaken musical memories. Take the time to be present.', 0),
('soins', 'en', 'Music during care can reduce discomfort and encourage cooperation. Choose familiar melodies.', 0),
('repas', 'en', 'Music during mealtimes can improve appetite and slow the pace of eating.', 0),
('apres-midi', 'en', 'Afternoon is ideal for musical memories — not too early, not too late in the day.', 0),
('coucher', 'en', 'Evening music should be slower and more soothing to prepare the body and mind for rest.', 0);
