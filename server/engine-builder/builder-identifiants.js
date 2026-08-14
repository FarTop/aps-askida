// APS — server/engine-builder/builder-identifiants.js — créé le 2026-08-14
// ================================================================
// LA FABRIQUE D'IDENTIFIANTS. Fonction PURE : un type, une longueur, un
// préfixe — une chaîne. Ni contexte, ni base, ni réseau.
//
// Extraite de builder-iconik-shared.js, qui tire builder-context.js et ne peut
// donc pas voyager dans une Lambda. Troisième application du même principe que
// builder-essences.js et builder-lookup-noyau.js : ce qui doit tourner des DEUX
// côtés vit dans un module pur, embarqué à l'émission.
//
// L'enjeu est nommé dans le handler d'origine : create_tree et aps.registry
// produisaient des formats étrangers l'un à l'autre sur le MÊME champ Iconik.
// Une quatrième implémentation, côté AWS, rejouerait la même faute — sauf que
// personne ne la verrait avant que le client ne compare deux collections.
// ================================================================
'use strict';

function genererIdentifiant(type, length, prefix) {
  const l = Math.max(1, Math.min(64, parseInt(length) || 8));
  const pad = n => String(n).padStart(2, '0');
  switch (type) {
    case 'uuid':
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const rnd = Math.random() * 16 | 0;
        return (c === 'x' ? rnd : (rnd & 0x3 | 0x8)).toString(16);
      });
    case 'hex':
      return new Array(l).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join('').toUpperCase();
    case 'alphanumeric':
    case 'prefixed': {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      const body = new Array(l).fill(0).map(() => chars[Math.floor(Math.random() * chars.length)]).join('');
      return (type === 'prefixed' ? (prefix || '') : '') + body;
    }
    case 'timestamp': {
      const now = new Date();
      const ts = now.getFullYear().toString() + pad(now.getMonth() + 1) + pad(now.getDate())
               + '-' + pad(now.getHours()) + pad(now.getMinutes()) + pad(now.getSeconds());
      return ts + '-' + Math.floor(Math.random() * 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
    }
    case 'timestamp_numeric': {
      const now = new Date();
      return String(now.getFullYear() % 100).padStart(2, '0')
           + pad(now.getMonth() + 1) + pad(now.getDate())
           + pad(now.getHours()) + pad(now.getMinutes()) + pad(now.getSeconds())
           + pad(Math.floor(Math.random() * 100));
    }
    default: {
      const min = Math.pow(10, l - 1);
      const max = Math.pow(10, l) - 1;
      return String(Math.floor(min + Math.random() * (max - min + 1)));
    }
  }
}

module.exports = { genererIdentifiant };
