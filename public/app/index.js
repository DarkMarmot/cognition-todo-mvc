
Muta.cog({

    // storage trait
    // routes trait

    states: {

        storage: '* readLocalStorage',
        activeFilter: 'noFilter',
        markAllStatus: false

    },

    actions: {

        markTodo: '& storage * markTodo > storage',
        createTodo: '& storage * createTodo > storage',
        destroyTodo: '& storage * destroyTodo > storage',
        markAll: '| markAllStatus * toggle > markAllStatus & storage * markAll > storage',
        clearCompleted: '& storage * removeCompleted > storage',
        refresh: '| storage > storage',
        filter: '> activeFilter'

    },

    calcs: {

        storageView: 'activeFilter, storage * toStorageView',
        activeCount: 'storage * toActiveCount',
        completedCount: 'storage * toCompletedCount'

    },

    buses: [
        'storage * writeLocalStorage'
    ],

    display: '<div class="page"><div class="app">' +
        '<slot name="list"></slot><slot name="footer"></slot>' +
        '</div></div>'


});
