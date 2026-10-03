/* =========================================================
   ECHOHAND ASL LEARNING
========================================================= */

(function () {

    "use strict";


    const $ = (id) =>
        document.getElementById(id);


    let currentGesture = "HELLO";

    let currentStep = 0;


    /* =======================================================
       LESSON DATA
    ======================================================= */

    const lessons = {

        "HELLO": {

            title: "Hello",

            steps: [

                {
                    title: "Raise your hand",

                    text:
                        "Raise your dominant hand near your head."
                },

                {
                    title: "Open your fingers",

                    text:
                        "Keep your fingers open and your palm facing outward."
                },

                {
                    title: "Move your hand",

                    text:
                        "Move your hand slightly away from your head to complete the greeting."
                }

            ]

        },


        "THANK YOU": {

            title: "Thank You",

            steps: [

                {
                    title: "Place your hand near your chin",

                    text:
                        "Keep your fingers together and place your dominant hand near your chin."
                },

                {
                    title: "Move forward",

                    text:
                        "Move your hand forward and slightly downward."
                },

                {
                    title: "Complete the sign",

                    text:
                        "Finish the outward movement smoothly."
                }

            ]

        },


        "YES": {

            title: "Yes",

            steps: [

                {
                    title: "Make a fist",

                    text:
                        "Close your dominant hand into a fist."
                },

                {
                    title: "Move your fist",

                    text:
                        "Move your fist up and down slightly."
                },

                {
                    title: "Complete the sign",

                    text:
                        "Repeat the movement naturally."
                }

            ]

        },


        "NO": {

            title: "No",

            steps: [

                {
                    title: "Raise two fingers",

                    text:
                        "Raise your index and middle fingers."
                },

                {
                    title: "Bring fingers together",

                    text:
                        "Touch your index and middle fingers against your thumb."
                },

                {
                    title: "Complete the movement",

                    text:
                        "Close the fingers together to complete the sign."
                }

            ]

        },


    };


    /* =======================================================
       OPEN LESSON
    ======================================================= */

    function openLesson(
        gesture
    ) {

        /*
         * HELP is a special emergency card.
         */

        if (
            gesture === "HELP"
        ) {

            window.EchoHandDashboard?.openModal(
                "emergencyModal"
            );

            return;

        }


        currentGesture =
            gesture;


        currentStep =
            0;


        const lesson =
            lessons[gesture];


        if (!lesson) {
            return;
        }


        const title =
            $("aslModalTitle");


        if (title) {

            title.textContent =
                `Learn: ${lesson.title}`;

        }


        renderStep();


        const modal = $("aslModal");

        if (modal) {
            modal.classList.add("is-open");
            modal.setAttribute("aria-hidden", "false");
        }

    }


    /* =======================================================
       RENDER STEP
    ======================================================= */

    function renderStep() {

        const lesson =
            lessons[currentGesture];


        if (!lesson) return;


        const step =
            lesson.steps[currentStep];


        if (!step) return;


        const stepNumber =
            $("aslStepCounter").textContent = `Step ${currentStep + 1} of ${currentLesson.steps.length}`;


        const stepCount =
            $("aslStepCounter").textContent = `Step ${currentStep + 1} of ${currentLesson.steps.length}`;


        const progress =
            $("aslProgressFill");


        const instructionTitle =
            $("aslLessonTitle").textContent = currentLesson.title || currentLesson.name;


        const instructionText =
            $("aslLessonInstruction").textContent = currentLesson.steps[currentStep];


        if (stepNumber) {

            stepNumber.textContent =
                `Step ${currentStep + 1}`;

        }


        if (stepCount) {

            stepCount.textContent =
                `${currentStep + 1} / ${lesson.steps.length}`;

        }


        if (progress) {

            const percentage =
                (
                    (currentStep + 1) /
                    lesson.steps.length
                ) * 100;


            progress.style.width =
                `${percentage}%`;

        }


        if (instructionTitle) {

            instructionTitle.textContent =
                step.title;

        }


        if (instructionText) {

            instructionText.textContent =
                step.text;

        }


        /*
         * Load user's ASL image if it exists.
         *
         * Expected:
         *
         * assets/asl/hello/step-1.png
         *
         * etc.
         */

        const image =
            $("aslLessonImage");

        const placeholder =
            $("aslLessonPlaceholder");


        if (
            image &&
            placeholder
        ) {

            const folder =
                currentGesture
                    .toLowerCase()
                    .replaceAll(
                        " ",
                        "-"
                    );


            const path =
                `assets/asl/${folder}/step-${currentStep + 1}.png`;


            image.src =
                path;


            image.onload =
                () => {

                    image.hidden =
                        false;

                    placeholder.hidden =
                        true;

                };


            image.onerror =
                () => {

                    image.hidden =
                        true;

                    placeholder.hidden =
                        false;

                };

        }


        /*
         * Button state
         */

        const previous =
            $("aslPrevBtn");

        const next =
            $("aslNextBtn");


        if (previous) {

            previous.disabled =
                currentStep === 0;

        }


        if (next) {

            next.textContent =
                currentStep ===
                lesson.steps.length - 1
                    ? "Finish"
                    : "Next →";

        }

    }


    /* =======================================================
       NEXT
    ======================================================= */

    function nextStep() {

        const lesson =
            lessons[currentGesture];


        if (!lesson) return;


        if (
            currentStep <
            lesson.steps.length - 1
        ) {

            currentStep++;

            renderStep();

            return;

        }


        window.EchoHandDashboard?.closeModal(
            "aslModal"
        );

    }


    /* =======================================================
       PREVIOUS
    ======================================================= */

    function previousStep() {

        if (
            currentStep <= 0
        ) {

            return;

        }


        currentStep--;

        renderStep();

    }


    /* =======================================================
       CARD EVENTS
    ======================================================= */

    function setupCards() {

        document
            .querySelectorAll(
                ".asl-card"
            )
            .forEach(card => {

                card.addEventListener(
                    "click",
                    () => {

                        const gesture =
                            card.dataset.gesture;

                        openLesson(
                            gesture
                        );

                    }
                );

            });

    }


    /* =======================================================
       BUTTONS
    ======================================================= */

function setupButtons() {

    $("aslNextBtn")
        ?.addEventListener(
            "click",
            nextStep
        );

    $("aslPrevBtn")
        ?.addEventListener(
            "click",
            previousStep
        );
    $("closeAslModal")?.addEventListener("click", () => {

    const modal = $("aslModal");

    if (!modal) return;

    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");

});

}


    /* =======================================================
       PUBLIC API
    ======================================================= */

    window.EchoHandASL = {

        openLesson

    };


    document.addEventListener(
        "DOMContentLoaded",
        () => {

            setupCards();

            setupButtons();

        }
    );

})();