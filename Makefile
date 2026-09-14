NAME = cursor-spotlight
UUID = $(NAME)@star-barsuk
EXTDIR = $(HOME)/.local/share/gnome-shell/extensions/$(UUID)
ZIPFILE = $(UUID).shell-extension.zip

SCHEMAS = schemas/org.gnome.shell.extensions.cursor-spotlight.gschema.xml
COMPILED_SCHEMAS = schemas/gschemas.compiled

LIB_SRC = $(wildcard lib/*.js)
PREFS_SRC = $(wildcard prefs/*.js)
ALL_JS = extension.js prefs.js $(LIB_SRC) $(PREFS_SRC)
LINT = tools/syntax-check.mjs

# Compile translations only when there is at least one po/<lang>.po and
# gettext (msgfmt) is installed; otherwise gnome-extensions pack would try to
# build an empty po/ directory and fail.
PODIR = $(shell [ -n "$$(ls po/*.po 2>/dev/null)" ] && command -v msgfmt >/dev/null 2>&1 && echo --podir=po)

.PHONY: build install uninstall enable disable zip lint pot clean

build: $(COMPILED_SCHEMAS)

$(COMPILED_SCHEMAS): $(SCHEMAS)
	glib-compile-schemas schemas

# Pack with the official tool so the schema is handled and LICENSE and
# translations are included. The compiled schema is intentionally left out of
# the archive (EGO compiles it on install) and copied in for local installs.
install: zip
	rm -rf $(EXTDIR)
	mkdir -p $(EXTDIR)
	unzip -qo $(ZIPFILE) -d $(EXTDIR)
	cp $(COMPILED_SCHEMAS) $(EXTDIR)/schemas/

uninstall:
	rm -rf $(EXTDIR)

enable:
	gnome-extensions enable $(UUID)

disable:
	gnome-extensions disable $(UUID)

zip: build
	rm -f $(ZIPFILE)
	gnome-extensions pack --force \
		--extra-source=lib \
		--extra-source=prefs \
		--extra-source=LICENSE \
		$(PODIR) \
		--schema=$(SCHEMAS) \
		-o . \
		.

lint:
	@if command -v gjs >/dev/null 2>&1; then \
		echo "Syntax check (SpiderMonkey):"; \
		gjs -m $(LINT) $(ALL_JS); \
	else \
		echo "gjs not found, skipping syntax check"; \
	fi
	@if command -v eslint >/dev/null 2>&1; then \
		eslint $(ALL_JS); \
	else \
		echo "eslint not found, skipping eslint"; \
	fi

pot:
	xgettext --from-code=UTF-8 --add-comments \
		--keyword=_ --keyword=ngettext:1,2 \
		--output=po/$(NAME).pot \
		$(ALL_JS)

clean:
	rm -f $(COMPILED_SCHEMAS)
	rm -f $(ZIPFILE)
