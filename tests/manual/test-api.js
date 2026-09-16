import GitHubClient from "../../src/github-client.js";

async function run() {

    const client = new GitHubClient("dummy-token");

    console.log("GitHub Client Created Successfully");

}

run();