/* =========================================================
   ECHOHAND DASHBOARD CONTROLLER
========================================================= */

(function () {

    "use strict";


    /* =======================================================
       HELPERS
    ======================================================= */

    const $ = (id) => document.getElementById(id);


    /* =======================================================
       MODAL CONTROL
    ======================================================= */

    function openModal(id) {

        const modal = $(id);

        if (!modal) return;

        modal.classList.add("is-open");
        modal.setAttribute("aria-hidden", "false");

        document.body.classList.add("modal-open");
    }


    function closeModal(id) {

        const modal = $(id);

        if (!modal) return;

        modal.classList.remove("is-open");
        modal.setAttribute("aria-hidden", "true");

        const anyOpenModal =
            document.querySelector(".modal-overlay.is-open");

        if (!anyOpenModal) {
            document.body.classList.remove("modal-open");
        }

    }


    /* =======================================================
       TOAST
    ======================================================= */

    let toastTimer = null;

    function showToast(message) {

        const toast = $("dashboardToast");
        const text = $("toastMessage");

        if (!toast || !text) return;

        text.textContent = message;

        toast.classList.add("show");

        clearTimeout(toastTimer);

        toastTimer = setTimeout(() => {
            toast.classList.remove("show");
        }, 3000);

    }


    /* =======================================================
       USER NAME
    ======================================================= */

    function loadUserName() {

        const userNameElement = $("userName");

        if (!userNameElement) return;

        try {

            const savedUser =
                JSON.parse(localStorage.getItem("echoHandUser"));

            if (savedUser && savedUser.name) {

                userNameElement.textContent =
                    savedUser.name.split(" ")[0];

                return;
            }

        } catch (error) {

            console.warn(
                "Could not read saved user:",
                error
            );

        }

    }


    /* =======================================================
       ASL HORIZONTAL SCROLL
    ======================================================= */

    function setupASLScroll() {

        const container =
            $("aslCardContainer");

        const leftButton =
            $("aslScrollLeft");

        const rightButton =
            $("aslScrollRight");


        if (!container) return;


        leftButton?.addEventListener(
            "click",
            () => {

                container.scrollBy({
                    left: -430,
                    behavior: "smooth"
                });

            }
        );


        rightButton?.addEventListener(
            "click",
            () => {

                container.scrollBy({
                    left: 430,
                    behavior: "smooth"
                });

            }
        );

    }


    /* =======================================================
       OPEN CAMERA
    ======================================================= */

    function setupCameraButton() {

        const button =
            $("openCameraBtn");

        if (!button) return;

        button.addEventListener(
            "click",
            () => {

                /*
                 * IMPORTANT:
                 * Open the modal regardless of whether a
                 * camera exists.
                 */

                openModal("cameraModal");

                if (
                    window.EchoHandCamera &&
                    typeof window.EchoHandCamera.initialize === "function"
                ) {

                    window.EchoHandCamera.initialize();

                }

            }
        );

    }


    /* =======================================================
       OPEN GLOVE
    ======================================================= */

    function setupGloveButton() {

        const button =
            $("openGloveBtn");

        if (!button) return;

        button.addEventListener(
            "click",
            () => {

                /*
                 * IMPORTANT:
                 * The glove modal opens even when the ESP32
                 * is not connected.
                 */

                openModal("gloveModal");

                if (
                    window.EchoHandGlove &&
                    typeof window.EchoHandGlove.initialize === "function"
                ) {

                    window.EchoHandGlove.initialize();

                }

            }
        );

    }


    /* =======================================================
       CLOSE MODALS
    ======================================================= */

    function setupModalClosing() {

        document
            .querySelectorAll("[data-close-modal]")
            .forEach(button => {

                button.addEventListener(
                    "click",
                    () => {

                        const modalId =
                            button.dataset.closeModal;

                        closeModal(modalId);

                    }
                );

            });


        document
            .querySelectorAll(".modal-overlay")
            .forEach(modal => {

                modal.addEventListener(
                    "click",
                    (event) => {

                        if (
                            event.target === modal
                        ) {

                            closeModal(modal.id);

                        }

                    }
                );

            });


        document.addEventListener(
            "keydown",
            (event) => {

                if (event.key !== "Escape") {
                    return;
                }

                document
                    .querySelectorAll(
                        ".modal-overlay.is-open"
                    )
                    .forEach(modal => {

                        closeModal(modal.id);

                    });

            }
        );

    }


    /* =======================================================
       LOGOUT
    ======================================================= */

    function setupLogout() {

        const button =
            $("logoutBtn");

        if (!button) return;

        button.addEventListener(
            "click",
            () => {

                /*
                 * Keep this simple until your real
                 * authentication backend is connected.
                 */

                localStorage.removeItem(
                    "echoHandLoggedIn"
                );

                localStorage.removeItem(
                    "echoHandUser"
                );

                window.location.href =
                    "login.html";

            }
        );

    }


    /* =======================================================
       GLOBAL API
    ======================================================= */

    window.EchoHandDashboard = {

        openModal,
        closeModal,
        showToast

    };


    /* =======================================================
       INITIALIZE
    ======================================================= */

    document.addEventListener(
        "DOMContentLoaded",
        () => {

            loadUserName();

            setupASLScroll();

            setupCameraButton();

            setupGloveButton();

            setupModalClosing();

            setupLogout();

        }
    );

})();