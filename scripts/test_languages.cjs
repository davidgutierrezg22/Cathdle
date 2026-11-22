const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

const web = path.join(__dirname, "..", "web");
const languageScript = fs.readFileSync(path.join(web, "languages.js"), "utf8");
const gameScript = fs.readFileSync(path.join(web, "script.js"), "utf8");
const playerScript = fs.readFileSync(path.join(web, "player.js"), "utf8");

for (const lang of ["en", "es", "pt", "fr", "ja"]) {
    test("Interface translations: " + lang, () => {
        const text = { textContent: "  Challenge difficulty  " };
        const attributes = { "aria-label": "Play the mystery song" };
        const button = {
            getAttribute: key => attributes[key],
            setAttribute: (key, value) => { attributes[key] = value; }
        };
        let walks = 0;
        const document = {
            documentElement: {},
            body: {},
            createTreeWalker() {
                walks++;
                let next = true;
                return { currentNode: text, nextNode() { const result = next; next = false; return result; } };
            },
            querySelectorAll: selector => selector === "[aria-label]" ? [button] : []
        };
        const context = vm.createContext({
            document, localStorage: { getItem: () => lang }, NodeFilter: { SHOW_TEXT: 4 }
        });
        vm.runInContext(languageScript, context);
        const { copy, tr, dictionary } = vm.runInContext("({copy, tr, dictionary})", context);
        assert.equal(document.documentElement.lang, lang);
        assert.equal(text.textContent.trim(), tr("Challenge difficulty"));
        assert.equal(attributes["aria-label"], tr("Play the mystery song"));
        assert.equal(walks, lang === "en" ? 0 : 1);
        assert.equal(copy.length, dictionary.size, "Duplicate English key");
        for (const row of copy) {
            assert.equal(row.length, 5, row[0]);
            const slots = value => (value.match(/\{\w+\}/g) || []).sort();
            for (const value of row) {
                assert.ok(value.trim(), row[0]);
                assert.deepEqual(slots(value), slots(row[0]), row[0]);
            }
        }
        for (const match of (gameScript + playerScript).matchAll(/\btr\("([^"]+)"/g)) {
            assert.ok(dictionary.has(match[1]), "Missing translation: " + match[1]);
        }
        assert.ok(tr("After {n} guesses", {n: 9}).includes("9"));
    });
}
