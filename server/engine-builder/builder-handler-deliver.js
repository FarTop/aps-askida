// APS — server/engine-builder/builder-handler-deliver.js — créé le 2026-08-05
// Port de aws_s3(), server/engine/wfd-engine-handlers.js:3486-3980 — SANS la
// branche `operation === 'artwork_s3'` (:3518-3761) : aucun core/facade du
// catalogue pivot ne peut produire `params.operation === 'artwork_s3'` (le
// panneau Deliver n'expose que connexionId/manifestId/objectKey/operation,
// et les occurrences réelles utilisent toutes `list_objects` — cf.
// config-schema.js:1076) — absence volontaire, pas un oubli.
//
// `s3Mappings` vient de la résolution de `params.manifestId`
// (Manifest.essences), même dérivation que pivot-to-wfd.js:99-125
// (manifestId -> s3Mappings), portée ici plutôt qu'au moment de la
// conversion. Partagé par le core `deliver` pur et la façade
// `aws_s3.deliver` (même fonction). Ports du pivot : out | miss | error.
'use strict';

const BuilderContext = require('./builder-context.js');
const Essences       = require('./builder-essences.js');

function r(val, ctx) { return BuilderContext.resolve(val, ctx); }

function _s3MappingsFromManifest(manifest) {
  const essences = (manifest && manifest.essences) || [];
  if (!essences.length) return null;
  return essences.map(e => {
    const m = {
      type: e.role || '',
      filter: Array.isArray(e.reconnu_par) ? e.reconnu_par.join(',') : (e.reconnu_par || ''),
      variable: e.sortie || '',
      cardinalite: e.cardinalite || 'optionnel',
    };
    if (e.cardinalite === 'au_plus_n') m.n = e.n || 1;
    if (Array.isArray(e.appliesTo) && e.appliesTo.length && e.appliesTo.indexOf('*') === -1) {
      m.appliesTo = e.appliesTo;
    }
    return m;
  });
}

async function deliver(step, ctx, deps) {
  const p = step.params || {};
  const connexionId = p.connexionId || '';
  // Défaut aligné sur config-schema.js (aws_s3.deliver, visibleSi) : les
  // occurrences réelles omettent toutes `operation`, et le formulaire les
  // traite comme `list_objects` implicite — le moteur doit faire pareil
  // (divergeait vers `head_object`, qui échoue toujours car objectKey via
  // filebase() n'a jamais d'extension : c'était le bug du Recheck PUBLISH).
  const operation   = p.operation   || 'list_objects';
  const objectKey   = r(p.objectKey || '', ctx);
  const resultVar   = p.resultVar   || 'awsResult';

  // Une clé S3 qui contient encore « {…} » signifie qu'une variable amont
  // n'a pas été résolue (resolve() rend le gabarit brut plutôt que du vide,
  // pour ne pas casser du texte libre — inoffensif dans un message, faux
  // dans un chemin). Sans ce garde-fou on interroge un préfixe littéral
  // « AmazonPrime/{ancestorPath}/ », qui ne trouve évidemment rien : la
  // livraison est alors déclarée manquante pour une raison qui n'a rien à
  // voir avec S3 (constaté le 2026-08-06 sur un Episode sans ParentID).
  if (/\{[^}]+\}/.test(objectKey)) {
    BuilderContext.addError(ctx, step.id,
      'Chemin S3 incomplet — « ' + objectKey + ' » contient une variable non résolue', 'warn');
    BuilderContext.storeResult(ctx, resultVar, { status: 0, cheminIncomplet: true, key: objectKey });
    return { port: 'error' };
  }

  const conn = p.connexionId && deps.resolved && deps.resolved.connexions
    ? deps.resolved.connexions[connexionId] : null;
  if (!conn) throw new Error('deliver : connexion introuvable — ' + connexionId);
  if (conn.authType !== 'aws_s3') throw new Error('deliver : la connexion doit être de type AWS S3');

  let _awsCreds = {};
  try { _awsCreds = JSON.parse(conn.authValue || '{}'); } catch (_) {}
  const accessKey = _awsCreds.key    || '';
  const secretKey = _awsCreds.secret || '';
  const region    = _awsCreds.region || 'eu-north-1';
  const bucket    = _awsCreds.bucket || '';

  if (!accessKey || !secretKey) throw new Error('deliver : credentials AWS manquants');
  if (!bucket)                  throw new Error('deliver : bucket S3 manquant');

  const crypto = require('crypto');
  const now     = new Date();
  const dateStr = now.toISOString().replace(/[:\-]|\.\d{3}/g, '').slice(0, 15) + 'Z';
  const dateDay = dateStr.slice(0, 8);

  const methodMap = {
    head_object: 'HEAD', get_object: 'GET', put_object: 'PUT',
    delete_object: 'DELETE', list_objects: 'GET',
  };
  const method = methodMap[operation] || 'GET';

  const encodedKey = objectKey.split('/').map(p2 => encodeURIComponent(p2)).join('/');
  const path  = operation === 'list_objects' ? `/${bucket}/` : `/${bucket}/${encodedKey}`;
  const query = operation === 'list_objects' ? 'delimiter=%2F&list-type=2&prefix=' + encodeURIComponent(objectKey) : '';
  const host  = `s3.${region}.amazonaws.com`;
  const url   = `https://${host}${path}${query ? '?' + query : ''}`;

  const payloadHash = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
  const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${dateStr}\n`;
  const signedHeaders    = 'host;x-amz-content-sha256;x-amz-date';
  const canonicalRequest = [method, path, query, canonicalHeaders, signedHeaders, payloadHash].join('\n');

  const credentialScope = `${dateDay}/${region}/s3/aws4_request`;
  const hashedRequest   = crypto.createHash('sha256').update(canonicalRequest).digest('hex');
  const stringToSign    = `AWS4-HMAC-SHA256\n${dateStr}\n${credentialScope}\n${hashedRequest}`;

  const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest();
  const signingKey = hmac(hmac(hmac(hmac('AWS4' + secretKey, dateDay), region), 's3'), 'aws4_request');
  const signature  = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex');

  const authHeader = `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const headers = {
    'Host': host, 'x-amz-date': dateStr,
    'x-amz-content-sha256': payloadHash, 'Authorization': authHeader,
  };

  const res = await globalThis.fetch(url, { method, headers });

  if (res.status === 404) {
    BuilderContext.storeResult(ctx, resultVar, { status: 404, exists: false, key: objectKey });
    return { port: 'miss' };
  }

  if (!res.ok && res.status !== 200) {
    const text = await res.text();
    BuilderContext.storeResult(ctx, resultVar, { status: res.status, error: text, key: objectKey });
    BuilderContext.addError(ctx, step.id, `AWS S3 HTTP ${res.status}`, 'warn');
    return { port: 'error' };
  }

  const resText = await res.text();

  if (operation === 'list_objects') {
    const keyMatches = [...resText.matchAll(/<Key>([^<]+)<\/Key>/g)];
    const keys  = keyMatches.map(m => m[1]);
    const count = keys.length;
    const base  = 's3://' + bucket + '/';

    const manifest = p.manifestId && deps.resolved && deps.resolved.manifests
      ? deps.resolved.manifests[p.manifestId] : null;
    const derivedMappings = manifest ? _s3MappingsFromManifest(manifest) : null;
    const mappings = (p.s3Mappings && p.s3Mappings.length) ? p.s3Mappings
      : derivedMappings && derivedMappings.length ? derivedMappings
      : [
          // `.mxf` ajouté le 2026-08-06 : c'est le format de livraison réel
          // (contrat tacite Bayard/VOD Factory — le transcodage est à la
          // charge du partenaire, donc le master part tel quel). Son absence
          // ici rendait la vidéo invisible alors qu'elle était bien dans S3 :
          // constaté sur un Unitaire où le listing voyait
          // « Le_Mag.mxf » ET « Le_Mag.srt », ne reconnaissait que le second,
          // et concluait à une vidéo manquante. Aligné sur `reconnu_par` du
          // manifeste réel, qui liste déjà .mp4/.mov/.ts/.mxf.
          { type: 'video', filter: '.mp4,.mov,.ts,.mpeg,.mpg,.mxf', variable: p.s3VarVideo || 's3_video_url' },
          { type: 'image', filter: '_poster,.jpg,.jpeg,.png',  variable: p.s3VarImage || 's3_image_url' },
          { type: 'subtitle', filter: '.srt,.vtt',             variable: p.s3VarSrt   || 's3_srt_url' },
        ];

    // La reconnaissance des essences vit dans builder-essences.js : fonction
    // pure, partagée avec la Lambda que réclame AWS Step Functions. ASL ne sait
    // pas reconnaître un fichier par motif de nom, et deux implémentations qui
    // divergent livreraient à une adresse ce qu'elles vérifieraient à une
    // autre. Le handler ne fait plus que ranger le résultat dans le contexte.
    const reconnu = Essences.reconnaitre(mappings, keys, base, ctx.vars?.TypeCollection);
    Object.entries(reconnu.variables).forEach(function ([nom, valeur]) {
      BuilderContext.setVar(ctx, nom, valeur);
    });
    const cardinaliteErreurs = reconnu.cardinalite;

    // Cumulé sur tout le run : un PUBLISH enchaîne plusieurs Deliver (Check
    // Collection, Check Asset, Recheck) et l'un d'eux peut n'avoir aucun
    // manifeste résolu. Remplacer plutôt qu'unir effacerait ce que le premier
    // avait établi.
    const dejaHors = (ctx.results && ctx.results._hors_niveau) || [];
    BuilderContext.storeResult(ctx, '_hors_niveau',
      dejaHors.concat(reconnu.horsNiveau.filter(v => dejaHors.indexOf(v) === -1)));

    const result = { status: res.status, count, prefix: objectKey, keys, rawXml: resText, cardinaliteErreurs: cardinaliteErreurs.length ? cardinaliteErreurs : undefined };
    BuilderContext.storeResult(ctx, resultVar, result);
    BuilderContext.setVar(ctx, resultVar + '_count', String(count));

    if (cardinaliteErreurs.length) {
      // 'info' et non 'warn' : ce listing est un PRÉ-CONTRÔLE technique
      // (« est-ce déjà livré ? ») dont le port `miss` est un chemin nominal
      // — c'est lui qui déclenche l'upload. Sur une première publication,
      // le bucket est forcément vide : la cardinalité ne PEUT pas être
      // satisfaite, et la consigner comme erreur marquait définitivement en
      // `partial` un run par ailleurs intégralement réussi. Le constat reste
      // consigné (visible dans Run › Action) ; c'est le graphe, via le
      // routage du port `miss`, qui décide si c'est un problème.
      BuilderContext.addError(ctx, step.id, 'Cardinalité non respectée — ' + cardinaliteErreurs.join(' ; '), 'info');
      return { port: 'miss' };
    }
    return count > 0 ? { port: 'out' } : { port: 'miss' };
  }

  const result = {
    status: res.status, exists: true, key: objectKey,
    headers: {
      contentLength: res.headers.get('content-length'),
      lastModified: res.headers.get('last-modified'),
      etag: res.headers.get('etag'),
    },
  };
  BuilderContext.storeResult(ctx, resultVar, result);
  BuilderContext.setVar(ctx, resultVar + '_exists', 'true');
  return { port: 'out' };
}

module.exports = deliver;
