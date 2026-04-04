# frozen_string_literal: true

require "rails_helper"

RSpec.describe "Tools" do
  let(:firestore_client) { instance_double(Google::Cloud::Firestore::Client) }
  let(:firestore_collection) { instance_double(Google::Cloud::Firestore::CollectionReference) }

  before do
    allow(Google::Cloud::Firestore).to receive(:new).and_return(firestore_client)
    allow(firestore_client).to receive(:col).with("tools").and_return(firestore_collection)
    allow(firestore_collection).to receive(:get).and_return([])
  end

  describe "GET /index" do
    it "returns http success" do
      get "/tools"
      expect(response).to have_http_status(:success)
    end
  end
end
