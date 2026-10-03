/* =========================================================
   ECHOHAND SPEECH
========================================================= */

(function () {

    "use strict";


    let selectedVoice = null;


    function loadVoices() {

        if (!("speechSynthesis" in window)) {
            return;
        }

        const voices =
            window.speechSynthesis.getVoices();

        if (!voices.length) return;


        /*
         * Prefer English voices.
         */

        selectedVoice =
            voices.find(
                voice =>
                    voice.lang &&
                    voice.lang.toLowerCase()
                        .startsWith("en")
            ) || voices[0];

    }


    function speak(text) {

        if (!text) return;


        if (!("speechSynthesis" in window)) {

            window.EchoHandDashboard?.showToast(
                "Speech synthesis is not supported by this browser."
            );

            return;
        }


        window.speechSynthesis.cancel();


        const utterance =
            new SpeechSynthesisUtterance(
                String(text)
            );


        utterance.lang = "en-US";

        utterance.rate = 0.9;

        utterance.pitch = 1;

        utterance.volume = 1;


        if (selectedVoice) {
            utterance.voice = selectedVoice;
        }


        window.speechSynthesis.speak(
            utterance
        );

    }


    window.speechSynthesis?.addEventListener(
        "voiceschanged",
        loadVoices
    );


    loadVoices();


    window.EchoHandSpeech = {

        speak,

        stop: () => {

            if ("speechSynthesis" in window) {
                window.speechSynthesis.cancel();
            }

        }

    };

})();
