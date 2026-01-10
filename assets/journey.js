/*! Covenant Journey Definition v1.0.0 */
(function () {
    'use strict';

    // Canonical ordered list of journey pages.
    // This is the single source of truth for:
    // - ToC rendering
    // - Soft page-load gate
    // - Progress unlock logic
    window.COVENANT_JOURNEY = [
        { id: 'invocation', title: 'Invocation and Preamble', href: 'invocation.html' },
        { id: 'foundation', title: 'Doctrinal Foundation', href: 'foundation.html' },
        { id: 'declaration', title: 'Declaration of Intent', href: 'declaration.html' },
        { id: 'I', title: 'Article Ⅰ: Of Sacred Silence', href: 'I.html' },
        { id: 'II', title: 'Article Ⅱ: Of Titles and Forms of Address', href: 'II.html' },
        { id: 'III', title: 'Article Ⅲ: Of the Duties of the Faithful', href: 'III.html' },
        { id: 'IV', title: 'Article Ⅳ: Of the Duties of the Lord', href: 'IV.html' },
        { id: 'V', title: 'Article Ⅴ: Of Interdependence and Mutual Consecration', href: 'V.html' },
        { id: 'VI', title: 'Article Ⅵ: Of Ceremonial and Symbolic Boundaries', href: 'VI.html' },
        { id: 'VII', title: 'Article Ⅶ: Of Interpretation and Counsel', href: 'VII.html' },
        { id: 'VIII', title: 'Article Ⅷ: Of Commands and Their Execution', href: 'VIII.html' },
        { id: 'IX', title: 'Article Ⅸ: Of Appeals and Resolution', href: 'IX.html' },
        { id: 'X', title: 'Article Ⅹ: Of Transgression, Correction, and Reconciliation', href: 'X.html' },
        { id: 'XI', title: 'Article Ⅺ: Of Amendments and Renewal', href: 'XI.html' },
        { id: 'XII', title: 'Article Ⅻ: Of Suspension, Succession, and Termination', href: 'XII.html' },
        { id: 'rituals', title: 'Rituals and Ceremonies', href: 'rituals.html' },
        { id: 'oath', title: 'Oath and Attestation', href: 'oath.html' },
        { id: 'consecrated', title: 'Seal and Consecration', href: 'consecrated.html' }
    ];

    // Optional reference pages (not part of linear unlock sequence).
    window.COVENANT_REFERENCES = [
        { id: 'lexicon', title: 'Full Lexicon', href: 'lexicon.html' },
        { id: 'covenant', title: 'Comprehensive Covenant', href: 'covenant.html' }
    ];

    // Helper: get index of page by ID.
    window.getJourneyIndex = function (pageId) {
        if (!pageId) return -1;
        for (var i = 0; i < window.COVENANT_JOURNEY.length; i++) {
            if (window.COVENANT_JOURNEY[i].id === pageId) return i;
        }
        return -1;
    };

    // Helper: get page object by ID.
    window.getJourneyPage = function (pageId) {
        var idx = window.getJourneyIndex(pageId);
        return (idx >= 0) ? window.COVENANT_JOURNEY[idx] : null;
    };
})();
