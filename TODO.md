1. Color coded edges
1. Check vertical node alignment logic


Let's add unit tests and react component tests. Here are some cases to test:

- Adding/editing/deleting a report. Make sure updates are also reflected in the graph.
- Import/export functionality. When importing, make sure list and graph reflect the json accurately. When exporting make sure json reflect graph accurately. Also make sure an invalid json shows user appropriate error.
- Selecting and moving a node. Verify the node alignment logic in those tests as well
- Selecting the matn node selects the whole report (its nodes and edges in the graph, in the list)
- Zooming in and out changes how the matn nodes are rendered in the graph (text when zoomed in vs markers when zoomed out)
