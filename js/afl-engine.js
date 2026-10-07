// js/afl-engine.js

class AFLEngine {
    constructor() {
        this.editor = null;
        this.defaultFormula = `// AmiBroker AFL Core
Plot( Close, "Price", "#26a69a", "styleCandle" );
Plot( MA( Close, 20 ), "SMA 20", "#2962ff", "styleLine" );
Plot( EMA( Close, 50 ), "EMA 50", "#ff6d00", "styleLine" );
`;
    }

    initEditor(textareaId) {
        const textarea = document.getElementById(textareaId);
        if (!textarea) return;

        if (window.CodeMirror) {
            this.editor = window.CodeMirror.fromTextArea(textarea, {
                mode: "javascript",
                theme: "default",
                lineNumbers: true,
                value: this.defaultFormula
            });
            this.editor.setValue(this.defaultFormula);
        } else {
            textarea.value = this.defaultFormula;
        }
    }

    getFormula() {
        return this.editor ? this.editor.getValue() : '';
    }
}

window.aflEngine = new AFLEngine();