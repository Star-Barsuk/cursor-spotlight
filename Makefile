UUID = cursor-spotlight@star-barsuk
EXTDIR = $(HOME)/.local/share/gnome-shell/extensions/$(UUID)
ZIPFILE = $(UUID).zip

SCHEMAS = schemas/org.gnome.shell.extensions.cursor-spotlight.gschema.xml
COMPILED_SCHEMAS = schemas/gschemas.compiled

JS_SRC = extension.js prefs.js
SRC = $(JS_SRC) metadata.json
LIB = lib
LIB_SRC = $(wildcard $(LIB)/*.js)
SCHEMA_DIR = schemas
LINT = tools/syntax-check.mjs

.PHONY: build install uninstall enable disable zip lint clean

build: $(COMPILED_SCHEMAS)

$(COMPILED_SCHEMAS): $(SCHEMAS)
	glib-compile-schemas $(SCHEMA_DIR)

install: build
	rm -rf $(EXTDIR)
	mkdir -p $(EXTDIR)
	cp $(SRC) $(EXTDIR)/
	cp -r $(LIB) $(EXTDIR)/
	cp -r $(SCHEMA_DIR) $(EXTDIR)/

uninstall:
	rm -rf $(EXTDIR)

enable:
	gnome-extensions enable $(UUID)

disable:
	gnome-extensions disable $(UUID)

zip: build
	rm -f $(ZIPFILE)
	rm -rf _zipdir
	mkdir -p _zipdir/$(UUID)
	cp $(SRC) _zipdir/$(UUID)/
	cp -r $(LIB) _zipdir/$(UUID)/
	cp -r $(SCHEMA_DIR) _zipdir/$(UUID)/
	cd _zipdir && zip -qr ../$(ZIPFILE) $(UUID)
	rm -rf _zipdir

lint:
	@if command -v gjs >/dev/null 2>&1; then \
		echo "Syntax check (SpiderMonkey):"; \
		gjs -m $(LINT) $(JS_SRC) $(LIB_SRC); \
	else \
		echo "gjs not found, skipping lint"; \
	fi
	@if command -v eslint >/dev/null 2>&1; then \
		eslint $(JS_SRC) $(LIB_SRC); \
	fi

clean:
	rm -f $(COMPILED_SCHEMAS)
	rm -f $(ZIPFILE)
	rm -rf _zipdir
