## Quickstart

In order to create posts, we use the
[`node-wpapi`](https://github.com/WP-API/node-wpapi) plugin. [This
plugin](https://wordpress.org/plugins/application-passwords/) is used to
generate application passwords, which will give you a `WP_TOKEN`.

We need to set user and token credentials, which should be exported in
your environment:

    export WP_USER='USER HERE'
    export WP_TOKEN='PASSWORD HERE'

We need an API TOKEN from Lever as well:

    export LEVER_API_TOKEN

After that, follow the instructions:

1. Clone this repo
2. Install dependendencies on project root: `yarn install`
3. Insert posts on WordPress using Lever data with `node app.js`

Note that you may want to remove older posts before inserting new posts.
This script currently does not remove older posts automatically.
