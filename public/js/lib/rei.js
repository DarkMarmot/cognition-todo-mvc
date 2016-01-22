;(function REI(context) {

    var Rei = function(domish){  // element, node, Rei, fragment or array-like (to fragment)
        if(domish._dom)
            return domish; // Rei returns itself if duck-wrapped
        return new Rei.prototype.init(domish);
    };


    Rei.prototype.init = function(domish){
        this._memory = {};
        this._nodes = [];
        this._dom = this._fromDom(domish); // pushes nodes as created for performance
        this[0] = this._nodes[0];
    };

    Rei.prototype.init.prototype = Rei.prototype;

    Rei.prototype.rawContent = Rei.prototype.raw = function(){
        return this[0];
    };



    Rei.prototype._fromDom = function(domish){

        var i, frag, children, count, node;
        var nodes = this._nodes;

        domish = domish._dom || domish; // remove Rei content wrapper if present

        if(domish.nodeType === 1) { // element node
            nodes.push(domish);
            return domish;
        }

        if(domish.nodeType === 11) { // fragment node
            children = domish.children;
            count = children.length;
            for(i = 0; i < count; i++){
                nodes.push(children[i]);
            }
            return (count === 1) ? nodes[0] : domish;
        }

        if(Array.isArray(domish) || domish.length) {

            count = domish.length;
            for(i = 0; i < count; i++){
                node = domish[i];
                nodes.push(node._dom || node); // convert Reis back to elements
            }

            if(count === 1)
                return nodes[0];

            frag = document.createDocumentFragment();
            for(i = 0; i < count; i++){
                node = nodes[i];
                frag.appendChild(node); // convert Reis back to elements
            }
            return frag;
        }
        return null; // throw error todo

    };

    Rei.prototype.toArray = function(){
        var raw = this.raw();
        var arr;
        if(raw.nodeType === 11){
            arr = [];
            for(var i = 0; i < raw.children.length; i++){
                arr.push(raw[i]);
            }
        } else {
            arr = [raw];
        }
        return arr;
    };


    Rei.prototype.detect = catbus.$.detect;


    Rei.prototype.append = function(domish){

        if(this._nodes.length !== 1)
            throw new Error('cannot append to multiple nodes!');

        var child = Rei(domish)._dom;
        this[0].appendChild(child);

        return this;
    };

    Rei.prototype.replaceWith = function(domish){

        var newContent = Rei(domish)._dom;
        var content = this[0];

        content.parentNode.replaceChild(newContent, content);

    };

    Rei.prototype.focus = function(){
        if(this._nodes.length !== 1)
            throw new Error('cannot focus to multiple nodes!');
        this[0].focus();
        return this;
    };

    Rei.prototype.val = function(value){
        if(arguments.length === 0)
            return this[0].value;

        this[0].value = value;
    };

    Rei.prototype.toggle = function(show, display){
        return show ? this.show(display) : this.hide();
    };

    Rei.prototype.show = function(display){
        this[0].style.display = display || this._memory.display || 'block';
        return this;
    };

    Rei.prototype.hide = function(){
        if(this[0].style.display === 'none')
            return this;

        this._memory.display =  this[0].style.display;
        this[0].style.display = 'none';
        return this;
    };

    Rei.prototype.vis = function(visibility){
        this[0].style.visibility = visibility ? 'visible' : 'hidden';
        return this;
    };

    Rei.prototype.text = function(text){
        if(arguments.length === 0)
            return this[0].textContent;
        this[0].textContent = text;
        return this;
    };

    Rei.prototype.first = function(){
        return this[0];
    };

    Rei.prototype.last = function(){
    };

    Rei.prototype.html = function(html){
        if(arguments.length === 0)
            return this[0].innerHTML;
        this[0].innerHTML = html;
        return this;
    };

    Rei.prototype.empty = function(){
        this[0].innerHTML = null;
        return this;
    };


    Rei.prototype.on = function(type, handler, useCapture){
        this[0].addEventListener(type, handler, useCapture);
        return this;
    };

    Rei.prototype.off = function(type, handler, useCapture){
        this[0].removeEventListener(type, handler, useCapture);
        return this;
    };

    Rei.prototype.remove = function(){
        var nodes = this._nodes;
        var count = nodes.length;
        for(var i = 0; i < count; i++){
            var node = nodes[i];
            if(node.parentNode){
                node.parentNode.removeChild(node);
            }
        }

        return this;
    };

    Rei.prototype.toggleClass = function(nameOrNames, add){

        if(!nameOrNames) return false;
        var names = nameOrNames.split(' ');

        for(var i = 0; i < names.length; i++){
            var name = names[i];
            if(name) {
                if(arguments.length == 2)
                    this._toggleClass(name, add);
                else
                    this._toggleClassImplicitly(name);
            }
        }


        return this;
    };

    Rei.prototype._toggleClass = function(name, setting){

        var class_list = this[0].classList;

        if(setting)
            class_list.add(name);
        else
            class_list.remove(name);

        return this;

    };

    Rei.prototype._toggleClassImplicitly = function(name){ // this is a bad way to do things, just for jquery compatibility

        var class_list = this[0].classList;

        if(!class_list.contains(name)) {
            class_list.add(name);
        } else {
            class_list.remove(name);
        }

        return this;
    };



    Rei.prototype.addClass = function(nameOrNames){
        var names = nameOrNames.split(' ');
        var class_list = this[0].classList;
        for(var i = 0; i < names.length; i++){
            var name = names[i];
            if(name)
                class_list.add(name);
        }
        return this;
    };


    Rei.prototype.removeClass = function(nameOrNames){
        if(!nameOrNames){
            this.removeAllClasses();
            return this;
        }
        var names = nameOrNames.split(' ');
        var class_list = this[0].classList;
        for(var i = 0; i < names.length; i++){
            var name = names[i];
            if(name)
                class_list.remove(name);
        }
        return this;
    };


    Rei.prototype.removeAllClasses = function(){
        var arr = [];
        var i;
        var list = this[0].classList;

        for(i = 0; i < list.length; i++){
            arr.push(list.item(i));
        }

        for(i = 0; i < arr.length; i++){
            this.removeClass(arr[i]);
        }

        return this;
    };


    Rei.prototype.prop = function(nameOrOptions, value){
        var element = this[0];
        if(arguments.length === 0) return element;
        if(arguments.length === 2) {
            element[nameOrOptions] = value;
        } else {
            for(var p in nameOrOptions){
                element[p] = nameOrOptions[p];
            }
        }
        return this;
    };


    Rei.prototype.get = function(n){
        return this._nodes[n];
    };

    Rei.prototype.css = function(nameOrOptions, value){
        var style = this[0].style;
        if(arguments.length === 0) return style;
        if(arguments.length === 2) {
            style[nameOrOptions] = value + '';
        } else {
            if(typeof nameOrOptions === 'string')
                return this[0].style[nameOrOptions];
            for(var p in nameOrOptions){
                style[p] = nameOrOptions[p] + '';
            }
        }
        return this;
    };

    Rei.prototype.attr = function(nameOrOptions, value){
        var attributes = this[0].attributes;
        if(arguments.length === 0) return attributes;
        if(arguments.length === 2) {
            this[0].setAttribute(nameOrOptions, value);
        } else {
            if(typeof nameOrOptions === 'string')
                return this[0].getAttribute(nameOrOptions);
            for(var p in nameOrOptions){
                this[0].setAttribute(p, nameOrOptions[p]);
            }
        }
        return this;
    };

    Rei.prototype.removeAttr = function(name){
        this[0].removeAttribute(name);
        return this;
    };

    var plugins = typeof seele !== 'undefined' && seele;
    if(plugins)
        plugins.register('rei', Rei, true);

    context.Rei = Rei; // bind to outer context

})(this);