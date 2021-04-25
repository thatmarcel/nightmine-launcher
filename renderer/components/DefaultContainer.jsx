import { Fragment } from "react";
import Head from "next/head";

const DefaultContainer = ({ children, style }) => {
    return (
        <Fragment>
            <Head>
                <title>Nightmine Launcher</title>
            </Head>
            <div style={style} className="min-h-screen m-0 p-0 absolute t-0 l-0 w-screen">
                { children }
            </div>
        </Fragment>
    )
}

export default DefaultContainer;
