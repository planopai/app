export default function FullscreenLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div
            style={{
                margin: 0,
                padding: 0,
                height: "100vh",
                overflow: "hidden",
            }}
        >
            {children}
        </div>
    );
}