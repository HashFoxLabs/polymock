import Header from "@/components/Header";
import Footer from "@/components/Footer";
import CommunityPage from "@/components/community/CommunityPage";

export const metadata = {
  title: "Community Hub - HashFox Labs",
  description:
    "Browse shared paper trades and backtested strategies across crypto, prediction markets, forex, stocks, and commodities.",
};

export default function Community() {
  return (
    <main>
      <video className="video-bg" autoPlay loop muted playsInline>
        <source src="/videos/background-video.mp4" type="video/mp4" />
      </video>

      <Header />
      <CommunityPage />
      <Footer />
    </main>
  );
}
