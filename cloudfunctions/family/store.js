// Uses wx-server-sdk 4.0.2 document DB APIs, not the CloudBase relational/SQL API.
function createDocumentStore(database) {
  return {
    transaction(callback) {
      return database.runTransaction(
        async (transaction) =>
          callback({
            async get(collection, id) {
              // database({ throwOnNotFound: false }) returns null for a missing document.
              const result = await transaction
                .collection(collection)
                .doc(id)
                .get();
              return result.data || null;
            },
            async set(collection, id, value) {
              const { _id, ...data } = value;
              await transaction.collection(collection).doc(id).set({ data });
            },
          }),
        5,
      );
    },
  };
}
module.exports = { createDocumentStore };
