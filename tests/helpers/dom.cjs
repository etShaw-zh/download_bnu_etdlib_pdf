function element(tagName = 'div') {
  const node = {
    tagName: tagName.toUpperCase(), children: [], attributes: {}, style: { setProperty(name, value) { this[name] = value; } },
    append(...nodes) { for (const child of nodes) { this.children.push(child); child.parentNode = this; } },
    appendChild(child) { this.append(child); return child; },
    setAttribute(name, value) { this.attributes[name] = String(value); },
    removeAttribute(name) { delete this.attributes[name]; },
    addEventListener() {}, removeEventListener() {}, focus() {},
    remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(child => child !== this); },
    attachShadow() { this.shadowRoot = element('shadow-root'); return this.shadowRoot; }
  };
  return node;
}
module.exports = { element };
