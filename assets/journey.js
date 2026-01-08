// Covenant Journey Registry v1
// Canonical ordered list of pages for the linear journey.
(function () {
    'use strict';

    window.COVENANT_JOURNEY_VERSION = '1.0.0';

    // Storage keys are versioned so future schema changes can migrate cleanly.
    var STORAGE_KEY = 'covenant_progress_v1';

    window.COVENANT_JOURNEY = {
        storageKey: STORAGE_KEY,

        // Linear journey pages (locked until reached).
        pages: [
            { href: 'invocation.html', title: 'Invocation and Preamble' },
            { href: 'foundation.html', title: 'Doctrinal Foundation' },
            { href: 'declaration.html', title: 'Declaration of Intent' },
            { href: 'I.html', title: 'Article Ⅰ: Of Sacred Silence' },
            { href: 'II.html', title: 'Article Ⅱ: Of Titles and Forms of Address' },
            { href: 'III.html', title: 'Article Ⅲ: Of the Duties of the Faithful' },
            { href: 'IV.html', title: 'Article Ⅳ: Of the Duties of the Lord' },
            { href: 'V.html', title: 'Article Ⅴ: Of Interdependence and Mutual Consecration' },
            { href: 'VI.html', title: 'Article Ⅵ: Of Ceremonial and Symbolic Boundaries' },
            { href: 'VII.html', title: 'Article Ⅶ: Of Interpretation and Counsel' },
            { href: 'VIII.html', title: 'Article Ⅷ: Of Commands and Their Execution' },
            { href: 'IX.html', title: 'Article Ⅸ: Of Appeals and Resolution' },
            { href: 'X.html', title: 'Article Ⅹ: Of Transgression, Correction, and Reconciliation' },
            { href: 'XI.html', title: 'Article Ⅺ: Of Amendments and Renewal' },
            { href: 'XII.html', title: 'Article Ⅻ: Of Suspension, Succession, and Termination' },
            { href: 'rituals.html', title: 'Rituals and Ceremonies' },
            { href: 'oath.html', title: 'Oath and Attestation' },
            { href: 'consecrated.html', title: 'Seal and Consecration' }
        ],

        // Always-available references (never locked).
        references: [
            { href: 'lexicon.html', title: 'Full Lexicon' },
            { href: 'covenant.html', title: 'Comprehensive Covenant' }
        ]
    };
})();
