
/*
TODO -----------------------------------------------------------------------------------------------

rollover figures should do the same as rollover figrefs because some
of the figures are big and the reading column is small.

TODO -----------------------------------------------------------------------------------------------
Save current paragraph in localstorage for nexttime (bookmark)

*/

var mod = function(){
    class NodeWrapper {
        constructor(node, pos) {
            this.node = node;
            this.extractTextNode(node);
            
            this.pos = pos;
            this.span = [pos, pos + node.textContent.length];
            console.log(this.span);
        }

        extractTextNode(node) {
            console.log(node);
            if (node.nodeName == "#text") {
                this.node = node;
                return;
            } else {
                node.childNodes.forEach(n => {
                    this.extractTextNode(n);
                });
            }
        }
        
        // is a paragraph-relative-pos is in this node.
        containsPos(pos) {
            return pos >= this.span[0] && pos < this.span[1];
        }

        // given a paragraph relative offset, what is the offset in this node?
        getOffset(pos) {
            return pos - this.span[0];
        }
    }

    // ---------------------------------------------------------------------------------------------
    class Sentence {
        // find a speakable sentence winthin a <p> node.  There might
        // be 5 sentences broken up over 3 child nodes.
        
        constructor(el, pos, txt) {
            this.el = el;
            this.span = [pos, pos + txt.length];
            this.wrappedNodes = [];
            this.txt = txt;
            
            this.setupNodeSpans();
            this.ranges = [];
        }
        
        setupNodeSpans() {
            var pos = 0;
            this.el.childNodes.forEach(node => {            
                let wnode = new NodeWrapper(node, pos);
                this.wrappedNodes.push(wnode);
                pos += node.textContent.length;
            });
        }
        
        highlight() {
            // <p>.childNodes can have more than one DOM element.
            // There might be [text, a, text] each of which
            // contributes to the rendered text in a paragraph seen by
            // the user.
            let wrappedNode0 = this.nodeContainingPos(this.span[0]);
            let offset0 = wrappedNode0.getOffset(this.span[0]);
            
            let wrappedNode1 = this.nodeContainingPos(this.span[1] - 1);
            let offset1 = wrappedNode1.getOffset(this.span[1]);
            
            let range = document.createRange();
            let selection = window.getSelection();
            
            selection.removeAllRanges();
            range.setStart(wrappedNode0.node, offset0);
            range.setEnd(wrappedNode1.node, offset1);
            selection.addRange(range);        
        }
        
        nodeContainingPos(pos) {
            let matches = this.wrappedNodes.filter(node => node.containsPos(pos));
            switch(matches.length) {
            case 0: throw Error("no matching nodes found with position: " + pos);
            case 1: return matches[0];
            default: throw Error("more than one matching node found?? with pos: " + pos);
            }
        }

        replaceAcronyms() {
            const acros = {
                "CPL": "current priviledge level",
                "PTE": "page table entry",
                "PPN": "physical page number",
                "IDT": "interrupt descriptor table",
                "%cs": "code segment register",
                "%esp": "stack pointer register",
                "%ss": "stack segment register",
                "%eflags": "e flags register",
                "%eip": "instruction pointer register",
                "DPL": "descriptor priviledge level",
                " IF ": " interrupt enable flag ",
                "80386": "eighty three eighty six",
                "setupkvm": "setup K V M",
                "1-2": "1 2",
                "KERNBASE": "kern base",
            };
            var txt = this.txt;
            for (const key of Object.keys(acros)) {
                txt = txt.replace(key, acros[key]);                
            }
            return txt;
        }

        
        selectAndSpeak(speed) {
            let synth = window.speechSynthesis;
            synth.cancel();
            this.highlight();
            
            var utterThis = new SpeechSynthesisUtterance(this.replaceAcronyms());
            utterThis.voice = synth.getVoices()[2];
            utterThis.pitch = 1;
            utterThis.rate = speed;
            synth.speak(utterThis);
        }
    }

    // ---------------------------------------------------------------------------------------------
    class Paragraph {
        constructor(el, speed) {
            this.speed = speed;
            this.el = el;
            this.synth = window.speechSynthesis;
            //
            this.sentences = [];
            this.curSentenceIdx = 0;
            this.buildSentences();
            this.sentences[0].highlight();
        }
        
        buildSentences() {
            var txt = this.el.textContent;
            var parts = txt
                .split(/[,;:\\.\\?][\s]/)           // split over punctuation.
                .filter(x => x.trim().length != 0); // filter out strings w/ pure whitespace.  
            
            var seperatorLength = 2;
            var pos = 0;
            parts.forEach(part => {
                if (part.length > 0) {
                    this.sentences.push(new Sentence(this.el, pos, part));
                    pos += part.length + seperatorLength;
                }
            });
        }

        atTop() {
            return this.curSentenceIdx <= 0;
        }
        
        atBottom() {
            return this.curSentenceIdx >= this.sentences.length - 1;
        }
        
        toBottom() {
            this.curSentence().highlight(false);
            this.curSentenceIdx = this.sentences.length - 1;
            this.curSentence().highlight(true);
        }

        curSentence() {
            return this.sentences[this.curSentenceIdx];
        }
        
        prevSentence() {
            if (!this.atTop()) {
                this.curSentenceIdx -= 1;
                this.curSentence().highlight(true);
            } else {
                throw Error("trying to increment this.curSentenceIdx out of range");
            }
        }
        
        nextSentence() {
            if (this.curSentenceIdx < this.sentences.length - 1) {
                this.curSentenceIdx += 1;
                this.curSentence().highlight(true);
            } else {
                throw Error("trying to increment this.curSentenceIdx out of range");
            }
        }
        
        repeat() {
            this.synth.cancel();
            this.sentences[this.curSentenceIdx].selectAndSpeak(this.speed);
        }

        speak() {
            this.synth.cancel();
            this.sentences[this.curSentenceIdx].selectAndSpeak(this.speed);
        }
        
        scrollTo() {
            $('html, body').animate({
                scrollTop: this.el.offsetTop - 300
            }, 50);        
        }
        
        updateSpeed(speed) { this.speed = speed; }
    }

    // ---------------------------------------------------------------------------------------------
    class ParagraphSelector {
        // TODO if clicking to bring focus to a new paragraph finds
        // that the same paragraph is being focused, then don't
        // refocus because doing so resets the current paragraph to 0,
        // thus losing the reader's place.
        
        constructor() {
            this.speed = 1.6;
            this.pels = $("p");
            this.pidx = 0;
            this.curParagraph = new Paragraph(this.pels[0], this.speed);
            this.synth = window.speechSynthesis;
            this.lastMotion = undefined; // 
            // setup click events for all paragraphs.
            this.pels.click(e => this.selectClick(e.target));
        }
        
        firstParagraph() {
            return this.pidx == 0;
        }
        
        lastParagraph() {
            return this.pidx >= this.pels.length - 1;
        }

        speakCurrentSentence() {
            this.curParagraph.speak();
        }
        
        selectClick(pel) {
            // need to find pidx of thie pel.
            for (var i=0; i<this.pels.length; i++) {
                if (this.pels[i].isEqualNode(pel)) {
                    this.pidx = i;                
                }
            }
            this.curParagraph = new Paragraph(pel, this.speed);
        }
        
        selectNextSentence() {
            if (this.curParagraph.atBottom() && !this.lastParagraph()) { 
                // if the current sentence is at the bottom of the paragraph
                // then move to the next paragraph,
                this.pidx += 1;
                // this.curParagraph.highlight(false);
                this.curParagraph = new Paragraph(this.pels[this.pidx], this.speed);
                this.curParagraph.scrollTo();

            } else if (!this.curParagraph.atBottom()) {
                this.curParagraph.nextSentence();
            } else if (this.curParagraph.atBottom() && this.lastParagraph()) {
                console.log("End of book.");
            } else {
                console.log("unhandled case in select next sentence");
            }
            this.curParagraph.speak();
        }
        
        selectPrevSentence() {
            if (this.curParagraph.atTop() && !this.firstParagraph()) { 
                // if the current sentence is at the top of the paragraph
                // then move to the prev paragraph,
                // this.curParagraph.highlight(false);
                this.pidx -= 1;
                this.curParagraph = new Paragraph(this.pels[this.pidx], this.speed);
                this.curParagraph.toBottom();
                this.curParagraph.scrollTo();
                
            } else if (!this.curParagraph.atTop()) {
                this.curParagraph.prevSentence();
            } else if (this.curParagraph.atTop() && this.firstParagraph()) {
                console.log("At the beginning");
            } else {
                console.log("unhandled case in select prev sentence");
            }
            this.curParagraph.scrollTo();
            this.curParagraph.speak();
            
        }

        decreaseSpeed() {
            if (this.speed > .4) this.speed -= .2;
            this.curParagraph.updateSpeed(this.speed);
            this.curParagraph.repeat();
        }

        stop() {
            let synth = window.speechSynthesis;
            synth.cancel();
        }

        increaseSpeed() {
            if (this.speed <= 1.8) this.speed += .2;
            this.curParagraph.updateSpeed(this.speed);
            this.curParagraph.repeat();
        }

        enableKeyEvents(enable) {
            $(document).unbind('keydown');
            if (enable) {
                $(document).keydown((event) => {
                    switch(event.keyCode) {
                         
                    case 27: { // escape key
                        this.stop();
                        break;
                    }
                    case 74: { // j
                        this.selectNextSentence();
                        break;
                    }
                    case 75: { // k
                        this.selectPrevSentence();
                        break;
                    }
                    case 83: { // s
                        this.speakCurrentSentence();
                        break;
                    }
                    case 187: { // +
                        this.increaseSpeed();
                        break;
                    }
                    case 189: { // -
                        this.decreaseSpeed();
                        break;
                    }
                    case 191:  // ?
                    case 72: { // h
                        // TODO rename this modal to something like keyshortcut help.
                        $('#exampleModalCenter').modal('show');
                    }
                    } // end switch
                });
            }
        }
    }
    
    var paragraphSelector = new ParagraphSelector();
    paragraphSelector.enableKeyEvents(true);
    
    // when the mouse is over the editor, unbind the key events so the
    // editor works as expected.
    
    $("#editor-col").hover(
        function(el) {
            paragraphSelector.enableKeyEvents(false);
        },
        function(p){ 
            paragraphSelector.enableKeyEvents(true);
        });
    
    return paragraphSelector;
}();
