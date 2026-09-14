// Developer syntax check for the extension ES modules.
//
// Parses each file with SpiderMonkey's Reflect.parse() in module mode,
// which catches syntax errors without executing GI imports. Dev-only:
// tools/ is not copied by `make install` or included in `make zip`.

import Gio from 'gi://Gio';

let failed = false;

for (const path of ARGV) {
    try {
        const [, bytes] = Gio.File.new_for_path(path).load_contents(null);
        const source = new TextDecoder().decode(bytes);
        Reflect.parse(source, {target: 'module'});
        print(`  ok   ${path}`);
    } catch (e) {
        failed = true;
        printerr(`  FAIL ${path}: ${e.message}`);
    }
}

if (failed) {
    printerr('Syntax check failed.');
    imports.system.exit(1);
}
