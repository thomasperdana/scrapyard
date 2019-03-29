
class EditToolBar{
    constructor(scrap_path){
        var self = this;
        this.scrap_path=scrap_path;
        this.buildTools()
        window.addEventListener("mousedown", function(e){
            if(e.button == 0) {
                if(!isDescendant(self.div, e.target) /** out of toolbar */
                   && self.last && self.editing){
                    e.preventDefault();
                    self.last.parentNode.removeChild(self.last);
                    self.last=null;
                }
                /** hide marker-pen menu when click somewhere */
                if(!$(e.target).hasClass("mark-pen-btn")){
                    if($(self.menu).is(":visible")){
                        e.preventDefault();
                        $(self.menu).hide();
                    }
                }
            }
        });
        window.addEventListener("mousemove", function(e){
            if(self.editing){
                var dom = document.elementFromPoint(e.pageX, e.pageY - window.scrollY);
                if(dom && !isDescendant(self.div, dom)){
                    if(dom != document.body && $(document.body).closest(dom).length == 0){
                        if(self.last)
                            self.last.style.border = self.last_border;
                        self.last_border = dom.style.border;
                        self.last = dom;
                        dom.style.border="2px solid #f00";
                    }else{
                        // document.body or ancestors
                    }
                }
            }
        });
    }
    isSelectionOn(){
        var selection = window.getSelection();
        if(selection && selection.rangeCount > 0){
            return !selection.getRangeAt(0).collapsed; 
        }
        return false;
    }
    toggleDomEdit(on){
        var self = this;
        if(self.last)
            self.last.style.border = self.last_border;
        self.last = null;
        self.last_border = null;
        self.editing = on;
        $(this.div).find("input[type=button]").prop("disabled", on);
        document.body.style.cursor=self.editing?"crosshair":"";
    }
    saveDoc(){
        var self=this;
        var doc = document.documentElement.cloneNode(true)
        $(doc).find(".scrapyard-edit-bar").remove();
        browser.runtime.sendMessage({
            type: 'SAVE_CONTENT2',
            content: $(doc).html(),
            path: self.scrap_path,
            title: document.title
        });
    }
    buildTools(){
        var self = this;
        var editing=false;
        var extension_id = browser.i18n.getMessage("@@extension_id");
        /** load editing css */
        loadCss("scrapyard_editing_css", `moz-extension://${extension_id}/edit.css`)
        loadCssInline("scrapyard_editing_markers_css", `moz-extension://${extension_id}/edit-markers.css`)
        /** toolbar */
        $(".scrapyard-edit-bar").remove();
        var div = document.createElement("div");
        div.className = "scrapyard-edit-bar"
        document.body.appendChild(div);
        this.div=div;
        /** icon */
        var img = document.createElement("img");
        img.className="scrapyard-icon"
        img.src = `moz-extension://${extension_id}/icons/scrapyard.svg`;
        div.appendChild(img);
        div.innerHTML+=" Scrapyard&nbsp;&nbsp;";
        /** body */
        document.body.style.marginBottom="100px";
        document.body.style.paddingLeft="0px";
        document.body.style.marginLeft="0px";
        /** save button */
        var btn = document.createElement("input");
        btn.type="button";
        btn.className="yellow-button"
        btn.value=chrome.i18n.getMessage("save");
        div.appendChild(btn);
        btn.addEventListener("click", function(){
            self.saveDoc();
        });
        /** modify dom button */
        var btn = document.createElement("input");
        btn.type="button";
        btn.className="blue-button"
        btn.value=chrome.i18n.getMessage("MODIFY_DOM_ON");
        div.appendChild(btn);
        btn.addEventListener("click", function(){
            editing=!editing;
            self.toggleDomEdit(editing)
            this.value=chrome.i18n.getMessage(editing?"MODIFY_DOM_OFF":"MODIFY_DOM_ON");
            $(this).prop("disabled", false)
        });
        /** mark pen button */
        var btn = document.createElement("input");
        btn.type="button";
        btn.className="blue-button mark-pen-btn"
        btn.value=chrome.i18n.getMessage("MARK_PEN");
        div.appendChild(btn);
        btn.addEventListener("click", function(){
            $(self.menu).toggle();
            var rect_div = self.div.getBoundingClientRect();
            var rect_btn = this.getBoundingClientRect();
            $(self.menu).css("bottom", (rect_div.bottom - rect_btn.top) + "px");
            $(self.menu).css("left", rect_btn.left + "px");
        });
        /** mark pen menu */
        var $m = $("<div>").appendTo(this.div);
        /** marker cleaner */
        var $item = $("<div>").appendTo($m).css({
            height:"14px",
            color:"#333",
            cursor:"pointer",
            borderBottom:"1px solid #999",
            padding:"8px 20px",
            verticalAlign:"middle"
        }).bind("mousedown", function(e){
            e.preventDefault()
            $(self.menu).hide();
            if(self.isSelectionOn()){
                clearMarkPen();
            }else{
                alert("{NO_SELECTION_ACTIVATED}".translate());
            }
        });
        $(`<div class='scrapyard-menu-item'>Clear Markers</div>`).appendTo($item).css({
            height:"14px",
            lineHeight:"14px",
            minWidth:"200px"
        });
        /** markers */
        for (let child of ["scrapyard-marker-1", "scrapyard-marker-2", "scrapyard-marker-3", "scrapyard-marker-4",
                           "scrapyard-marker-5", "scrapyard-marker-6", "scrapyard-marker-7", "scrapyard-marker-8"]){
            var $item = $("<div>").appendTo($m).css({
                height:"14px",
                color:"#333",
                cursor:"pointer",
                borderBottom:"1px solid #999",
                padding:"8px 20px",
                verticalAlign:"middle"
            }).bind("mousedown", function(e){
                e.preventDefault()
                $(self.menu).hide();
                if(self.isSelectionOn()){
                    mark(child);
                }else{
                    alert("{NO_SELECTION_ACTIVATED}".translate());
                }
            });
            $(`<div class='scrapyard-menu-item ${child}'>Example Text</div>`).appendTo($item).css({
                height:"14px",
                lineHeight:"14px",
                minWidth:"200px"
            });
        }
        $m.css({
            position: 'absolute',
            zIndex: 2147483647,
            border: "1px solid #999",
            background: "#fff",
            display: "none",
            boxShadow: "5px 5px 5px #888888",
            borderWidth: "1px 1px 0px 1px"
        });
        this.menu = $m[0];
        /** reload button */
        var btn = document.createElement("input");
        btn.type="button";
        btn.className="blue-button"
        btn.value=chrome.i18n.getMessage("Reload");
        div.appendChild(btn);
        btn.addEventListener("click", function(){
            window.location.reload()
        });
    }
}

$(document).ready(function() {
    new EditToolBar(path);
});

console.log("==> edit-content.js loaded")

function getTextNodesBetween(rootNode, startNode, endNode) {
    var pastStartNode = false, reachedEndNode = false, textNodes = [];
    function getTextNodes(node) {
        if (node == startNode) {
            pastStartNode = true;
        } else if (node == endNode) {
            reachedEndNode = true;
        } else if (node.nodeType == 3) {
            if (pastStartNode && !reachedEndNode && !/^\s*$/.test(node.nodeValue)) {
                textNodes.push(node);
            }
        } else {
            for (var i = 0, len = node.childNodes.length; !reachedEndNode && i < len; ++i) {
                getTextNodes(node.childNodes[i]);
            }
        }
    }
    if(startNode != endNode)
        getTextNodes(rootNode);
    return textNodes;
}

function surround(txnode, tag, cls, start_offset, end_offset){
    var textRange = document.createRange();
    var el = document.createElement(tag);
    el.className=cls;
    if(Number.isInteger(start_offset) && Number.isInteger(end_offset)){
        textRange.setStart(txnode, start_offset);
        textRange.setEnd(txnode, end_offset);
    }else{
        textRange.selectNodeContents(txnode);
    }
    textRange.surroundContents(el); /* only work for selection  within textnode */
    textRange.detach()
    return el;
}

function getCurrSelection(){
    var selection = {}
    selection.range = window.getSelection().getRangeAt(0);
    selection.parent = selection.range.commonAncestorContainer; /* element */

    /* these can be only text nodes for selection made by user */
    selection.start = selection.range.startContainer; /* textnode */
    selection.end = selection.range.endContainer; /* textnode */

    return selection;
}

function clearMarkPen(){
    var selection = getCurrSelection()
    $(selection.parent).find(".scrapyard-mark-pen").each(function(){
        if(selection.range.intersectsNode(this))
            $(this).replaceWith($(this).text());
    });
}

function mark(hlclass){
    var hltag="span";
    hlclass = "scrapyard-mark-pen " + hlclass;

    var selection = getCurrSelection()

    /* there are maybe text nodes between start and end (range cross more than one tag) */
    getTextNodesBetween(selection.parent, selection.start, selection.end).forEach(function(tn){
        surround(tn, hltag, hlclass)
    });

    /* surround edges */
    if(selection.start == selection.end){
        /** range in single text node */
        var span = surround(selection.start, hltag, hlclass, selection.range.startOffset, selection.range.endOffset);
        selection.range.setStart(span.firstChild, 0)
        selection.range.setEnd(span.firstChild, span.firstChild.nodeValue.length)
    }else{
        var span1 = surround(selection.start, hltag, hlclass, selection.range.startOffset, selection.start.nodeValue.length);
        var span2 = surround(selection.end, hltag, hlclass, 0, selection.range.endOffset);
        selection.range.setStart(span1.firstChild, 0)
        selection.range.setEnd(span2.firstChild, span2.firstChild.nodeValue.length)
    }
}