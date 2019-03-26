import {backend} from "./backend.js"

import {
    NODE_TYPE_ARCHIVE,
    NODE_TYPE_BOOKMARK,
    NODE_TYPE_GROUP,
    NODE_TYPE_SHELF,
    NODE_TYPE_SEPARATOR,
    TODO_STATE_CANCELLED,
    TODO_STATE_DONE,
    TODO_STATE_POSTPONED,
    TODO_STATE_TODO,
    TODO_STATE_WAITING
} from "./db.js"

import {showDlg, alert, confirm} from "./dialog.js"

class BookmarkTree {
    constructor(element) {
        this._element = element;

        $(element).jstree({
            plugins: ["wholerow", "contextmenu", "dnd", "types", "state"],
            core: {
                worker: false,
                animation: 0,
                check_callback: BookmarkTree.checkOperation,
                themes: {
                    name: "default",
                    dots: false,
                    icons: true,
                },
            },
            contextmenu: {
                show_at_node: false,
                items: BookmarkTree.contextMenu
            },
            types: {
                "#": {
                    "valid_children": [NODE_TYPE_SHELF]
                },
                [NODE_TYPE_BOOKMARK]: {
                    "valid_children": []
                },
                [NODE_TYPE_ARCHIVE]: {
                    "valid_children": []
                },
                [NODE_TYPE_SEPARATOR]: {
                    "valid_children": []
                }
            },
            state: {}
        }).on("move_node.jstree", BookmarkTree.moveNode);

        this._inst = $(element).jstree(true);

        $(document).on("click.jstree", $(".jstree-anchor"), (e) => {
            if (e.button === 0 || e.button === 1) {
                e.preventDefault();
                let clickable = e.target.getAttribute("data-clickable");
                let id = e.target.getAttribute("data-id");
                if (clickable && !e.ctrlKey) {
                    let node = this.data.find(n => n.id == id);

                    console.log(this.data)
                    console.log(id);
                    console.log(node);
                    if (node) {
                        browser.tabs.create({
                            "url": node.uri
                        });
                    }
                }
                return false;
            }
        })
    }

    static toJsTreeNode(n) {
        n.text = n.name;

        n.parent = n.parent_id;
        if (!n.parent)
            n.parent = "#";

        if (n.type == NODE_TYPE_SHELF)
            n.icon = "/icons/bookmarks.svg";
        else if (n.type == NODE_TYPE_GROUP)
            n.icon = "/icons/group.svg";
        else if (n.type == NODE_TYPE_SEPARATOR) {
            n.text = "─".repeat(30);
            n.a_attr = {
                "class": "separator-node"
            };
        }
        else if (n.type != NODE_TYPE_SHELF) {
            let uri = "";
            if (n.uri)
                uri = false //n.uri.length > 60
                    ? "\x0A" + n.uri.substring(0, 60) + "..."
                    : ("\x0A" + n.uri);

            n.li_attr = {
                "class": "show_tooltip",
                "title": `${n.text}${uri}`
            };

            n.a_attr = {
                "data-id": n.id,
                "data-clickable": "true"
            };

            if (!n.icon)
                n.icon = "/icons/homepage.png";
        }

        n.data = {};
        n.data.uuid = n.uuid;

        return n;
    }

    set data(nodes) {
        this._inst.settings.core.data = nodes;
    }

    get data() {
        return this._inst.settings.core.data
    }

    update(nodes) {
        nodes.forEach(BookmarkTree.toJsTreeNode);
        this.data = nodes;

        let state;

        let shelves = this.data.filter(n => n.type == NODE_TYPE_SHELF);
        if (shelves.length === 1) {
            this._inst.settings.state.key = shelves[0].name;
            state = JSON.parse(localStorage.getItem(shelves[0].name));
        }

        this._inst.refresh(true, () => state? state.state: null);
        // let root_node = this._inst.get_node(nodes.find(n => n.type == NODE_TYPE_SHELF));
        // this._inst.open_node(root_node);
    }

    renameRoot(name) {
        let root_node = this._inst.get_node(this.data.find(n => n.type == NODE_TYPE_SHELF));
        this._inst.rename_node(root_node, name);
    }

    static checkOperation(operation, node, parent, position, more) {
        // disable dnd copy
        if (operation === "copy_node") {
            return false;
        } else if (operation === "move_node") {
        }
        return true;
    }

    static moveNode(_, data) {
        let tree = $(this).jstree(true);
        let parent = tree.get_node(data.parent);

        if (data.parent != data.old_parent) {
            let node = tree.get_node(data.node);

            backend.moveNodes([node.original.id], parent.original.id).then(new_nodes => {
                //console.log("Nodes moved: "  + node.original.uuid);
                BookmarkTree.reorderNodes(tree, parent);
            });
        }
        else {
            BookmarkTree.reorderNodes(tree, parent);
        }
    }

    static reorderNodes(tree, parent) {
        let siblings = parent.children.map(c => tree.get_node(c));

        let positions = [];
        for (let i = 0; i < siblings.length; ++i) {
            let node = {};
            node.id = siblings[i].original.id;
            node.pos = i + 1;
            positions.push(node);
        }

        backend.reorderNodes(positions);
    }


    /* context menu listener */
    static contextMenu(ctx_node) { // TODO: i18n
        let tree = this;
        let selected_nodes = tree.get_selected(true) || [];
        let multiselect = selected_nodes && selected_nodes.length > 1;
        let all_nodes = tree.settings.core.data;
        let ctx_node_data = ctx_node.original;

        function setTODOState(state) {
            let selected_ids = selected_nodes.map(n => n.original.id);
            let todo_states = [];

            selected_ids.forEach(n => todo_states.push({id: n, todo_state: state}));

            backend.setTODOState(todo_states).then(() => {
                    console.log("Todo is set");
                });
        }

        let items = {
            openItem: {
                label: "Open",
                action: function () {
                    for (let n of selected_nodes) {
                        switch (n.original.type) {
                            case NODE_TYPE_BOOKMARK:
                                browser.tabs.create({
                                    "url": n.original.uri
                                });
                                break;
                        }
                    }
                }
            },
            openAllItem: {
                label: "Open All",
                action: function () {
                    let children = all_nodes.filter(n => ctx_node.children.some(id => id == n.id));
                    children.forEach(c =>  browser.tabs.create({
                        "url": c.uri
                    }))
                }
            },
            sortItem: {
                label: "Sort by Name",
                action: function () {
                    let children = ctx_node.children.map(c => tree.get_node(c));
                    children.sort((a, b) => a.text.localeCompare(b.text));
                    ctx_node.children = children.map(c => c.id);

                    tree.redraw_node(ctx_node, true, false, true);
                    BookmarkTree.reorderNodes(tree, ctx_node);
                }
            },
            openOriginalItem: {
                label: "Open the Original Link",
                action: function () {
                    browser.tabs.create({
                        "url": ctx_node_data.uri
                    });
                }
            },
            newFolderItem: {
                label: "New Folder",
                action: function () {
                    // TODO: i18n
                    showDlg("prompt", {caption: "Create Folder", label: "Name"}).then(dlg_data => {
                        let name;
                        if (name = dlg_data.title) {
                            let selectedOption = $("#shelfList option:selected");
                            let shelf = selectedOption.text();

                            if (/*!isBuiltinShelf(shelf)*/true) {
                                backend.createGroup(ctx_node_data.id, name).then(group => {
                                    if (group) {
                                        BookmarkTree.toJsTreeNode(group);
                                        tree.deselect_all(true);
                                        tree.select_node(tree.create_node(ctx_node, group));
                                        BookmarkTree.reorderNodes(tree, ctx_node);
                                    }
                                });
                            }
                            else {
                                alert("{Error}", `Can not create folder in a built-in shelf.`);
                                return;
                            }
                        }
                    });
                }
            },
            newSeparatorItem: {
                label: "New Separator",
                action: function () {
                    let parent = tree.get_node(ctx_node.parent);
                    backend.addSeparator(parent.original.id).then(separator => {
                            let position = $.inArray(ctx_node.id, parent.children);
                            tree.create_node(parent, BookmarkTree.toJsTreeNode(separator), position + 1);
                            BookmarkTree.reorderNodes(tree, parent);
                        });
                }
            },
            cutItem: {
                separator_before: true,
                label: "Cut",
                action: function () {
                    tree.cut(selected_nodes);
                }
            },
            copyItem: {
                label: "Copy",
                action: function () {
                    tree.copy(selected_nodes);
                }
            },
            pasteItem: {
                label: "Paste",
                _disabled: !(tree.can_paste() && (ctx_node_data.type == NODE_TYPE_GROUP
                    || ctx_node_data.type == NODE_TYPE_SHELF)),
                action: function () {
                    let buffer = tree.get_buffer();
                    let selection =  Array.isArray(buffer.node)
                        ? buffer.node.map(n => n.original.id)
                        : [buffer.node.original.id];

                    (buffer.mode == "copy_node"
                        ? backend.copyNodes(selection, ctx_node_data.id)
                        : backend.moveNodes(selection, ctx_node_data.id))
                        .then(new_nodes => {
                            switch (buffer.mode) {
                                case "copy_node":
                                    break;
                                case "move_node":
                                    for (let s of selection)
                                        tree.delete_node(s);
                                    break;
                            }

                            for (let n of new_nodes) {
                                let parent = tree.get_node(n.parent_id);
                                tree.create_node(parent, BookmarkTree.toJsTreeNode(n), "last");
                            }

                            BookmarkTree.reorderNodes(tree, ctx_node);

                            tree.clear_buffer();
                        });
                }
            },
            todoItem: {
                separator_before: true,
                label: "TODO",
                submenu: {
                    todoItem: {
                        label: "TODO",
                        action: function () {
                            setTODOState(TODO_STATE_TODO);
                        }
                    },
                    waitingItem: {
                        label: "WAITING",
                        action: function () {
                            setTODOState(TODO_STATE_WAITING);
                        }
                    },
                    postponedItem: {
                        label: "POSTPONED",
                        action: function () {
                            setTODOState(TODO_STATE_POSTPONED);
                        }
                    },
                    cancelledItem: {
                        label: "CANCELLED",
                        action: function () {
                            setTODOState(TODO_STATE_CANCELLED);
                        }
                    },
                    doneItem: {
                        label: "DONE",
                        action: function () {
                            setTODOState(TODO_STATE_DONE);
                        }
                    },
                    clearItem: {
                        separator_before: true,
                        label: "Clear",
                        action: function () {
                            setTODOState(null);
                        }
                    }
                }
            },
            deleteItem: {
                separator_before: true,
                label: "Delete",
                action: function () {
                    confirm("{Warning}", "{ConfirmDeleteItem}").then(() => {
                        let selected_ids = selected_nodes.map(n => n.original.id);

                        backend.deleteNodes(selected_ids).then(() => {
                                tree.delete_node(selected_nodes);
                            });
                    });
                }
            },
            propertiesItem: {
                separator_before: true,
                label: "Properties...",
                action: function () {
                    switch (ctx_node.original.type) {
                        case NODE_TYPE_BOOKMARK:
                        case NODE_TYPE_ARCHIVE:
                            showDlg("properties", ctx_node_data).then(data => {
                                let original_node_data = all_nodes.find(n => n.id == ctx_node.id);
                                Object.assign(original_node_data, data);
                                original_node_data.name = ctx_node_data.text = data.text;
                                backend.updateBookmark(Object.assign(ctx_node_data, original_node_data)).then(() => {
                                        tree.rename_node(ctx_node, ctx_node_data.text);
                                    });
                            });
                            break;
                    }
                }
            },
            renameItem: {
                label: "Rename",
                action: function () {
                    switch (ctx_node.original.type) {
                        case NODE_TYPE_SHELF:
                            $("#shelf-menu-rename").click();
                            break;
                        case NODE_TYPE_GROUP:
                            showDlg("prompt", {caption: "Rename",
                                label: "Name", title: ctx_node_data.text}).then(data => {
                                let new_name;
                                if (new_name = data.title) {
                                    backend.renameGroup(ctx_node_data.id, new_name).then(group => {
                                            ctx_node_data.text = new_name;
                                            ctx_node_data.path = group.path;
                                            tree.rename_node(tree.get_node(ctx_node), new_name);
                                        });
                                }
                            });
                            break;
                    }
                }
            }
        };

        if (ctx_node.original.type !== NODE_TYPE_SHELF) {
            switch (ctx_node.original.type) {
                case NODE_TYPE_GROUP:
                    delete items.openItem;
                    delete items.openOriginalItem;
                    delete items.propertiesItem;
                    break;
                case NODE_TYPE_ARCHIVE:
                case NODE_TYPE_BOOKMARK:
                    delete items.openAllItem;
                    delete items.sortItem;
                    delete items.openOriginalItem;
                    delete items.newFolderItem;
                    delete items.renameItem;
                    break;
            }
        }
        else {
            for (let k in items)
                if (!["newFolderItem", "renameItem", "pasteItem"].find(s => s === k))
                    delete items[k];
        }

        if (multiselect) {
            items["sortItem"] && (items["sortItem"]._disabled = true);
            items["renameItem"] && (items["renameItem"]._disabled = true);
            items["openAllItem"] && (items["openAllItem"]._disabled = true);
            items["newFolderItem"] && (items["newFolderItem"]._disabled = true);
            items["propertiesItem"] && (items["propertiesItem"]._disabled = true);
            items["openOriginalItem"] && (items["openOriginalItem"]._disabled = true);
        }

        return items;
    }

}


export {BookmarkTree};
