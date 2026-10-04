/* =========================================================
   ECHOHAND CAMERA MODULE
========================================================= */

(function () {

    "use strict";


    const $ = (id) =>
        document.getElementById(id);


    let stream = null;

    let initialized = false;

    let subtitleHistory = [];

    let lastGesture = "";


    /* =======================================================
       UPDATE CAMERA STATUS
    ======================================================= */

    function setStatus(message) {

        const status =
            $("cameraStatus");

        if (status) {
            status.textContent = message;
        }

    }


    function setBadge(message) {

        const badge =
            $("cameraStatusBadge");

        if (badge) {
            badge.textContent = message;
        }

    }


    /* =======================================================
       INITIALIZE
    ======================================================= */

    function initialize() {

        if (initialized) {
            return;
        }

        initialized = true;


        const video =
            $("cameraVideo");

        if (!video) return;


        video.style.display = "none";


        setStatus(
            "Camera is ready. Press Start Camera or use Demo Gesture."
        );

        setBadge(
            "Camera inactive"
        );

    }


    /* =======================================================
       START CAMERA
    ======================================================= */

    async function startCamera() {

        const video =
            $("cameraVideo");

        const placeholder =
            $("cameraPlaceholder");


        if (!video) return;


        /*
         * Camera API unavailable
         */

        if (
            !navigator.mediaDevices ||
            !navigator.mediaDevices.getUserMedia
        ) {

            setStatus(
                "Camera access is not available in this browser. Demo mode is still available."
            );

            setBadge(
                "Camera unavailable"
            );

            return;
        }


        try {

            stream =
                await navigator.mediaDevices.getUserMedia({
                    video: true,
                    audio: false
                });


            video.srcObject = stream;

            video.style.display = "block";

            if (placeholder) {
                placeholder.style.display = "none";
            }

            setStatus(
                "Camera connected. CV gesture detection can be connected here."
            );

            setBadge(
                "Camera active"
            );


            window.EchoHandDashboard?.showToast(
                "Camera started."
            );

        } catch (error) {

            console.warn(
                "Camera error:",
                error
            );


            video.style.display = "none";

            if (placeholder) {
                placeholder.style.display = "flex";
            }


            setStatus(
                "Camera could not be opened. You can still use Demo Gesture."
            );


            setBadge(
                "Camera unavailable"
            );

        }

    }


    /* =======================================================
       STOP CAMERA
    ======================================================= */

    function stopCamera() {

        if (!stream) {
            return;
        }


        stream
            .getTracks()
            .forEach(track => {
                track.stop();
            });


        stream = null;


        const video =
            $("cameraVideo");

        if (video) {
            video.srcObject = null;
            video.style.display = "none";
        }


        const placeholder =
            $("cameraPlaceholder");

        if (placeholder) {
            placeholder.style.display = "flex";
        }


        setStatus(
            "Camera stopped."
        );

        setBadge(
            "Camera inactive"
        );

    }


    /* =======================================================
       SHOW GESTURE
    ======================================================= */

    function receiveDetection(data) {

        if (!data) return;


        const gesture =
            String(
                data.gesture || ""
            ).trim().toUpperCase();


        if (!gesture) return;


        /*
         * Add to subtitle history.
         */

        subtitleHistory.push(
            gesture
        );


        if (
            subtitleHistory.length > 6
        ) {

            subtitleHistory.shift();

        }


        const subtitle =
            $("cameraSubtitle");


        if (subtitle) {

            subtitle.textContent =
                subtitleHistory.join(" ");

            /*
             * Restart subtitle animation.
             */

            subtitle.style.animation =
                "none";

            void subtitle.offsetWidth;

            subtitle.style.animation =
                "subtitleFade 0.35s ease";

        }


        /*
         * Speak only when the detected gesture changes.
         */

        if (
            gesture !== lastGesture
        ) {

            lastGesture =
                gesture;

            window.EchoHandSpeech?.speak(
                gesture
            );

        }

    }


    /* =======================================================
       DEMO GESTURE
    ======================================================= */

    const demoGestures = [
        "HELLO",
        "THANK YOU",
        "YES",
        "NO",
        "I LOVE YOU",
        "HELP"
    ];


    function demoGesture() {

        const gesture =
            demoGestures[
                Math.floor(
                    Math.random() *
                    demoGestures.length
                )
            ];


        receiveDetection({

            source: "camera",

            gesture,

            confidence:
                0.90 +
                Math.random() * 0.08,

            timestamp:
                new Date().toISOString()

        });

    }


    /* =======================================================
       BUTTONS
    ======================================================= */

    function setupButtons() {

        $("cameraStartBtn")
            ?.addEventListener(
                "click",
                startCamera
            );


        $("cameraDemoBtn")
            ?.addEventListener(
                "click",
                demoGesture
            );


        $("cameraSpeakBtn")
            ?.addEventListener(
                "click",
                () => {

                    const subtitle =
                        $("cameraSubtitle");

                    if (!subtitle) return;

                    window.EchoHandSpeech?.speak(
                        subtitle.textContent
                    );

                }
            );

    }


    /* =======================================================
       PUBLIC API
    ======================================================= */

    window.EchoHandCamera = {

        initialize,

        startCamera,

        stopCamera,

        receiveDetection,

        demoGesture

    };


    document.addEventListener(
        "DOMContentLoaded",
        setupButtons
    );

})();