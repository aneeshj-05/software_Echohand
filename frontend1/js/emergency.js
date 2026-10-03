/* =========================================================
   ECHOHAND EMERGENCY MODULE
========================================================= */

(function () {

    "use strict";


    let currentLocation =
        null;


    const $ = (id) =>
        document.getElementById(id);


    /* =======================================================
       GET LOCATION
    ======================================================= */

    function getLocation() {

        const status =
            $("locationStatus");


        if (!navigator.geolocation) {

            if (status) {

                status.textContent =
                    "Location is not supported by this browser.";

            }

            return;

        }


        if (status) {

            status.textContent =
                "Requesting your current location...";

        }


        navigator.geolocation.getCurrentPosition(

            (position) => {

                const latitude =
                    position.coords.latitude;

                const longitude =
                    position.coords.longitude;


                currentLocation = {

                    latitude,

                    longitude

                };


                if (status) {

                    status.textContent =
                        `Location ready: ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;

                }


                window.EchoHandDashboard?.showToast(
                    "Your location is ready."
                );

            },


            (error) => {

                console.warn(
                    "Geolocation error:",
                    error
                );


                if (status) {

                    status.textContent =
                        "Location could not be obtained. Please allow location access and try again.";

                }

            },

            {

                enableHighAccuracy: true,

                timeout: 10000,

                maximumAge: 0

            }

        );

    }


    /* =======================================================
       MAP LINK
    ======================================================= */

    function createMapsLink() {

        if (!currentLocation) {

            return null;

        }


        return (
            "https://www.google.com/maps?q=" +
            encodeURIComponent(
                `${currentLocation.latitude},${currentLocation.longitude}`
            )
        );

    }


    /* =======================================================
       EMERGENCY MESSAGE
    ======================================================= */

    function createEmergencyMessage() {

        const userName =
            document.getElementById(
                "userName"
            )?.textContent ||
            "EchoHand user";


        const mapsLink =
            createMapsLink();


        let message =
            "EchoHand Emergency Alert\n\n" +
            "HELP gesture detected.\n" +
            `User: ${userName}\n`;


        if (mapsLink) {

            message +=
                `Location: ${mapsLink}`;

        } else {

            message +=
                "Location: Not available";

        }


        return message;

    }


    /* =======================================================
       SEND EMERGENCY ALERT
    ======================================================= */

    function sendEmergencyAlert() {

        /*
         * MongoDB/backend is not connected yet.
         *
         * Therefore we do NOT pretend that contacts
         * have been fetched from the database.
         */


        if (!currentLocation) {

            window.EchoHandDashboard?.showToast(
                "Please get your location first."
            );

            return;

        }


        const message =
            createEmergencyMessage();


        /*
         * Temporary prototype behavior:
         *
         * Open WhatsApp with a pre-filled message.
         *
         * Later, your backend / Automate workflow
         * can send the message to stored contacts.
         */

        const whatsappUrl =
            "https://wa.me/?text=" +
            encodeURIComponent(
                message
            );


        window.open(
            whatsappUrl,
            "_blank",
            "noopener,noreferrer"
        );


        window.EchoHandDashboard?.showToast(
            "Emergency message prepared in WhatsApp."
        );

    }


    /* =======================================================
       BUTTONS
    ======================================================= */

    function setupButtons() {

        $("getLocationBtn")
            ?.addEventListener(
                "click",
                getLocation
            );


        $("sendEmergencyBtn")
            ?.addEventListener(
                "click",
                sendEmergencyAlert
            );

    }


    /* =======================================================
       PUBLIC API
    ======================================================= */

    window.EchoHandEmergency = {

        getLocation,

        sendEmergencyAlert,

        createMapsLink

    };


    document.addEventListener(
        "DOMContentLoaded",
        setupButtons
    );

})();