export const NODE_TYPE_SHELF = 1;
export const NODE_TYPE_GROUP = 2;
export const NODE_TYPE_BOOKMARK = 3;
export const NODE_TYPE_ARCHIVE = 4;
export const NODE_TYPE_SEPARATOR = 5;
export const TODO_STATE_TODO = 1;
export const TODO_STATE_DONE = 2;
export const TODO_STATE_WAITING = 3;
export const TODO_STATE_POSTPONED = 4;
export const TODO_STATE_CANCELLED = 5;
export const DEFAULT_SHELF_NAME = "default";


import UUID from "./lib/uuid.js"
import Dexie from "./lib/dexie.es.js"

const db = new Dexie("scrapyard");

db.version(1).stores({
    nodes: `++id,&uuid,parent_id,type,name,uri,*tags,pos,date_added,date_modified,todo_state,todo_date,todo_pos`,
    blobs: `++id,&node_id`,
    index: `++id,&node_id,*words`
});

db.on('populate', () => {
    db.nodes.add({name: DEFAULT_SHELF_NAME, type: NODE_TYPE_SHELF, uuid: "1", date_added: new Date(), pos: 1});
});


class Storage {
    constructor() {
        this.db = db;
    }

    async addNode(datum, reset_order = true) {
        if (reset_order) {
            datum.pos = 1;
            datum.todo_pos = 1;
        }
        datum.uuid = UUID.numeric();
        datum.date_added = new Date();
        datum.id = await db.nodes.add(datum);
        return datum;
    }

    // addNodes(data) {
    //     db.transaction('rw', db.nodes, () => {
    //         for (const n of nodes) {
    //             n.uuid = UUID.numeric();
    //             node.date_added = new Date();
    //             db.nodes.add(n);
    //         }
    //     }).catch(function (e) {
    //         console.log("Error adding nodes");
    //     });
    // }

    getNode(id) {
        return db.nodes.where("id").equals(id).first();
    }

    getNodes(ids) {
        return db.nodes.where("id").anyOf(ids).toArray();
    }

    getChildNodes(id) {
        return db.nodes.where("parent_id").equals(id).toArray();
    }

    async updateNodes(nodes) {
        return db.transaction('rw', db.nodes, async () => {
            for (let n of nodes) {
                let id = n.id;
                //delete n.id;
                n.date_modified = new Date();
                await db.nodes.where("id").equals(id).modify(n);
            }
            return nodes;
        });
    }

    async updateNode(node) {
        if (node && node.id) {
            let id = node.id;
            //delete node.id;
            node.date_modified = new Date();
            await db.nodes.update(id, node);
        }
        return node;
    }

    async _selectAllChildrenOf(node, children) {
        let group_children = await db.nodes.where("parent_id").equals(node.id).toArray();

        if (group_children && group_children.length) {
            for (node of group_children) {
                for (let c of group_children.map(c => c.id))
                    children.add(c);
                await this._selectAllChildrenOf(node, children);
            }
        }
    }

    async queryFullSubtree(ids) {
        if (!Array.isArray(ids))
            ids = [ids];

        let children = new Set();
        for (let n of ids) {
            children.add(n);
            await this._selectAllChildrenOf({id: n}, children);
        }

        return db.nodes.where("id").anyOf(children).toArray();
    }


    async queryNodes(group, options) {
        let {search, tags, types, path, limit, depth, order} = options;

        let where = limit
            ? db.nodes.limit(limit)
            : db.nodes;

        let searchrx = search? new RegExp(search, "i"): null;

        let subtree = new Set();
        if (group && (depth === "subtree" || depth === "root+subtree")) {
            await this._selectAllChildrenOf(group, subtree);
        }

        let nodes = await where.filter(node => {
            let result = path? !!group: true;

            if (types)
                result = result && types.some(t => t == node.type);

            if (search)
                result = result && (searchrx.test(node.name) || searchrx.test(node.uri));

            if (group && depth === "group")
                result = result && node.parent_id === group.id;
            else if (group && depth === "subtree")
                result = result && subtree.has(node.id);
            else if (group && depth === "root+subtree")
                result = result && (subtree.has(node.id) || node.id === group.id);

            if (tags) {
                if (node.tags) {
                    let intersection = tags.filter(value => node.tags.includes(value))
                    result = result && intersection.length > 0;
                }
                else
                    result = false;
            }

            return result;
        }).toArray();

        if (order === "custom")
            nodes.sort((a, b) => a.pos - b.pos);

        return nodes;
    }

    async deleteNodes(nodes) {
        if (!Array.isArray)
            nodes = [nodes];

        await db.blobs.where("node_id").anyOf(nodes).delete();
        await db.index.where("node_id").anyOf(nodes).delete();
        return db.nodes.bulkDelete(nodes);
    }

    async queryShelf(name) {
        let where = db.nodes.where("type").equals(NODE_TYPE_SHELF);

        if (name)
            return await where.and(n => name.toLocaleUpperCase() === n.name.toLocaleUpperCase())
                .first();
        else
            return await where.toArray();
    }

    async queryGroup(parent_id, name) {
        return await db.nodes.where("parent_id").equals(parent_id)
           .and(n => name.toLocaleUpperCase() === n.name.toLocaleUpperCase())
           .first();
    }

    async storeBlob(node_id, data) {
        let node = await this.getNode(node_id);

        if (node)
            return db.blobs.add({
                node_id: node.id,
                data: data
            });
    }

    async fetchBlob(node_id, is_uuid = false) {
        if (is_uuid) {
            let node = await db.nodes.where("uuid").equals(node_id).first();
            if (node)
                node_id = node.id;
        }
        return db.blobs.where("node_id").equals(node_id).first();
    }
}


export default Storage;