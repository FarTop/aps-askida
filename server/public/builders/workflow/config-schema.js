/**
 * config-schema.js — Schéma déclaratif de configuration par type de nœud
 *
 * Décrit, pour une étape pivot, la liste des champs à afficher — chacun par sa
 * NATURE (voir config-renderer). Le moteur rend ces descripteurs comme reflet
 * du modèle de config ; ce fichier ne fait que DECRIRE quoi montrer.
 *
 * Premier jet volontairement minimal (2 natures : texte, variable), pour poser
 * la fondation et prouver la réactivité + la règle des accolades. Les schémas
 * riches par famille (décision, http, boucle…) s'ajouteront ensuite, champ par
 * champ, chacun une projection du modèle.
 */

const ConfigSchema = (() => {

  // Champs communs à tout nœud.
  function _communs() {
    return [
      { nature: 'texte', chemin: 'label', label: 'Name', placeholder: 'Node name' }
    ];
  }

  // Schéma pour une étape. Communs + champs propres à la famille.
  function pour(etape) {
    const s = _communs();
    const core = etape && etape.core;

    // Familles qui produisent un résultat stockable.
    const produit = ['http_request', 'lookup', 'transform', 'set_variable', 'loop', 'http_sequence'];
    if (core && produit.indexOf(core) >= 0) {
      s.push({ nature: 'variable', chemin: 'resultVar', label: 'Store result as',
               placeholder: '{result}' });
    }

    // Décision : conditions MULTIPLES via la nature liste. Chaque condition est
    // un sous-schéma {opérateur + champs dépendants}. Démontre la composition :
    // liste contient opérateur qui pilote ses champs, le tout réactif.
    if (core === 'decision') {
      s.push({ nature: 'variable', chemin: 'on', label: 'Evaluate', placeholder: '{value}' });
      s.push({
        nature: 'liste', chemin: 'conditions', label: 'Conditions', ajoutLabel: 'Add condition',
        itemDefaut: { op: 'equals', value: '' },
        itemSchema: [
          { nature: 'operateur', chemin: 'op', label: 'Operator', options: [
            { valeur: 'equals', libelle: 'equals' },
            { valeur: 'contains', libelle: 'contains' },
            { valeur: 'between', libelle: 'between' },
            { valeur: 'is_empty', libelle: 'is empty' }
          ] },
          { nature: 'texte', chemin: 'value', label: 'Value',
            visibleSi: function (m) { return ['equals', 'contains'].indexOf(m.lire('op')) >= 0; } },
          { nature: 'texte', chemin: 'from', label: 'From',
            visibleSi: function (m) { return m.lire('op') === 'between'; } },
          { nature: 'texte', chemin: 'to', label: 'To',
            visibleSi: function (m) { return m.lire('op') === 'between'; } },
          { nature: 'texte', chemin: 'label', label: 'Branch label', placeholder: 'e.g. Série' }
        ]
      });
    }

    return s;
  }

  return { pour };

})();

if (typeof window !== 'undefined') window.ConfigSchema = ConfigSchema;
if (typeof module !== 'undefined') module.exports = ConfigSchema;
